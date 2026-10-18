import { describe, expect, it } from "vitest";
import {
  conversationFromReplyAddress,
  normalizeAddress,
  normalizeMessageId,
  parseMessageIdList,
  replyAddress,
} from "../src/lib/email-channel/addresses";
import { parseAuthenticationResults, readAuthentication, type MailHeader } from "../src/lib/email-channel/auth-results";
import { composeReply, referencesHeader, replySubject, type ReplyInput } from "../src/lib/email-channel/compose";
import { detectLocale } from "../src/lib/email-channel/copy";
import { htmlToText } from "../src/lib/email-channel/html-text";
import { hasPlainTextPart } from "../src/lib/email-channel/inbound";
import { automatedReason } from "../src/lib/email-channel/loop";
import { EMAIL_MAX_ATTEMPTS, nextEmailAttempt } from "../src/lib/email-channel/outbound";
import { stripQuotedReply } from "../src/lib/email-channel/quotes";
import { chooseProvider } from "../src/lib/email-channel/settings";
import { acceptsThread, threadLookupIds, type ThreadCandidate } from "../src/lib/email-channel/threading";
import { EmailSendError, cloudflareTransport, resendTransport } from "../src/lib/email-channel/transport";

const SECRET = "session-secret-for-tests-0123456789abcdef";
const CONVERSATION = "cnv_01j9zz0000abcdefghjkmnpqrs";
const OTHER = "cnv_01j9zz0000zzzzzzzzzzzzzzzz";

describe("reply+ addresses", () => {
  it("round-trips, fits in a local part and survives a lower-casing mail server", async () => {
    const address = await replyAddress(SECRET, CONVERSATION, "support.example.com");
    expect(address.split("@")[0]!.length).toBeLessThanOrEqual(64);
    expect(await conversationFromReplyAddress(SECRET, address, "support.example.com")).toBe(CONVERSATION);
    expect(await conversationFromReplyAddress(SECRET, address.toUpperCase(), "support.example.com")).toBe(CONVERSATION);
  });

  it("rejects a guessed, swapped, re-signed or misdirected token", async () => {
    const address = await replyAddress(SECRET, CONVERSATION, "example.com");
    const [local, domain] = address.split("@") as [string, string];
    const sig = local.split(".")[1]!;
    const flipped = `${local.slice(0, -1)}${local.endsWith("a") ? "b" : "a"}@${domain}`;
    expect(await conversationFromReplyAddress(SECRET, flipped, "example.com")).toBeNull();
    // Someone else's conversation id with this conversation's signature.
    expect(await conversationFromReplyAddress(SECRET, `reply+${OTHER.slice(4)}.${sig}@example.com`, "example.com")).toBeNull();
    expect(await conversationFromReplyAddress("another-secret-0123456789abcdef0123", address, "example.com")).toBeNull();
    expect(await conversationFromReplyAddress(SECRET, address.replace("@example.com", "@evil.com"), "example.com")).toBeNull();
    expect(await conversationFromReplyAddress(SECRET, "support@example.com", "example.com")).toBeNull();
  });
});

describe("addresses and Message-IDs", () => {
  it("normalises addresses and refuses what isn't one", () => {
    expect(normalizeAddress('"Ana" <Ana.Lopez@Example.COM>')).toBe("ana.lopez@example.com");
    expect(normalizeAddress("ana@localhost")).toBeNull();
    expect(normalizeAddress("ana@example.com\r\nBcc: x@y.com")).toBeNull();
  });

  it("reads Message-ID lists in order, without brackets or duplicates", () => {
    expect(normalizeMessageId(" <abc@mail.example.com> ")).toBe("abc@mail.example.com");
    expect(normalizeMessageId("<a b@x>")).toBeNull();
    expect(parseMessageIdList("<a@x> <b@x>\r\n <a@x> <c@x>")).toEqual(["a@x", "b@x", "c@x"]);
  });

  it("looks up In-Reply-To first, then References newest to oldest", () => {
    expect(threadLookupIds(["parent@x"], ["root@x", "mid@x", "parent@x"])).toEqual(["parent@x", "mid@x", "root@x"]);
  });
});

describe("which emails may continue a conversation", () => {
  const candidate = (via: ThreadCandidate["via"], externalId: string | null = null): ThreadCandidate => ({
    conversationId: CONVERSATION,
    via,
    contact: { email: "Ana@Example.com", external_id: externalId },
  });

  it("verified senders continue by token or headers", () => {
    expect(acceptsThread(candidate("token"), "ana@example.com", true)).toBe(true);
    expect(acceptsThread(candidate("headers", "user_1"), "ana@example.com", true)).toBe(true);
  });

  it("someone else never joins, verified or not", () => {
    expect(acceptsThread(candidate("token"), "mallory@example.com", true)).toBe(false);
  });

  it("an unverified sender continues only through the reply address, and never into an identified contact", () => {
    expect(acceptsThread(candidate("token"), "ana@example.com", false)).toBe(true);
    expect(acceptsThread(candidate("headers"), "ana@example.com", false)).toBe(false);
    expect(acceptsThread(candidate("token", "user_1"), "ana@example.com", false)).toBe(false);
  });
});

const header = (key: string, value: string): MailHeader => ({ key, value });

describe("authentication results", () => {
  const cloudflare = header(
    "authentication-results",
    "mx.cloudflare.net; dkim=pass header.d=example.com header.s=s1 header.b=abc; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=example.com; spf=pass (mx.cloudflare.net: domain of ana@example.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=ana@example.com",
  );

  it("parses methods, properties and comments", () => {
    const parsed = parseAuthenticationResults(cloudflare.value)!;
    expect(parsed.authservId).toBe("mx.cloudflare.net");
    expect(parsed.results.map((r) => `${r.method}=${r.result}`)).toEqual(["dkim=pass", "dmarc=pass", "spf=pass"]);
    expect(parsed.results[1]!.props["header.from"]).toBe("example.com");
    expect(parseAuthenticationResults("i=2; mx.cloudflare.net; dmarc=fail header.from=x.com", true)!.results[0]!.result).toBe("fail");
  });

  it("DMARC pass from our server verifies the sender", () => {
    const auth = readAuthentication([cloudflare], "example.com");
    expect(auth).toEqual({ spf: "pass", dkim: "pass", dmarc: "pass", verified: true });
  });

  it("ignores results a sender wrote themselves: other servers, and anything below our server's header", () => {
    const forged = header("authentication-results", "mx.cloudflare.net; dmarc=pass header.from=bank.com");
    const ours = header("authentication-results", "mx.cloudflare.net; spf=none smtp.mailfrom=bank.com; dmarc=none header.from=bank.com");
    expect(readAuthentication([ours, forged], "bank.com").verified).toBe(false);
    expect(readAuthentication([header("authentication-results", "evil.example; dmarc=pass header.from=bank.com")], "bank.com").verified).toBe(false);
    expect(readAuthentication([], "bank.com")).toEqual({ spf: null, dkim: null, dmarc: null, verified: false });
  });

  it("DKIM counts only when it signs the From domain; SPF alone never does", () => {
    const dkim = (d: string) => header("arc-authentication-results", `i=1; mx.cloudflare.net; dkim=pass header.d=${d}; dmarc=none; spf=pass`);
    expect(readAuthentication([dkim("example.com")], "example.com").verified).toBe(true);
    expect(readAuthentication([dkim("mail.example.com")], "example.com").verified).toBe(true);
    expect(readAuthentication([dkim("sendgrid.net")], "example.com").verified).toBe(false);
    expect(readAuthentication([dkim("com")], "example.com").verified).toBe(false);
    const spfOnly = header("authentication-results", "mx.cloudflare.net; spf=pass smtp.mailfrom=example.com; dkim=none; dmarc=none");
    expect(readAuthentication([spfOnly], "example.com").verified).toBe(false);
  });

  it("a DMARC pass for another From domain doesn't count", () => {
    const other = header("authentication-results", "mx.cloudflare.net; dmarc=pass header.from=attacker.com");
    expect(readAuthentication([other], "bank.com").verified).toBe(false);
  });

  it("trusts the configured server only", () => {
    const own = header("authentication-results", "mx.example.org; dmarc=pass header.from=example.com");
    expect(readAuthentication([own], "example.com", "mx.example.org").verified).toBe(true);
    expect(readAuthentication([own], "example.com").verified).toBe(false);
  });
});

describe("loop protection", () => {
  const person = "ana@example.com";

  it("spots auto-replies, lists and bounces", () => {
    expect(automatedReason([header("auto-submitted", "auto-replied")], person)).toBe("auto-submitted");
    expect(automatedReason([header("x-autoreply", "yes")], person)).toBe("auto-reply");
    expect(automatedReason([header("precedence", "Bulk")], person)).toBe("precedence bulk");
    expect(automatedReason([header("precedence", "list")], person)).toBe("precedence list");
    expect(automatedReason([], "")).toBe("bounce");
    expect(automatedReason([], "<>")).toBe("bounce");
    expect(automatedReason([], "MAILER-DAEMON@mx.example.com")).toBe("bounce");
    expect(automatedReason([header("content-type", "multipart/report; report-type=delivery-status")], person)).toBe("delivery report");
  });

  it("lets people through", () => {
    expect(automatedReason([header("auto-submitted", "no"), header("precedence", "first-class")], person)).toBeNull();
  });
});

describe("quote stripping", () => {
  const strip = (text: string) => stripQuotedReply(text).text;

  it("Gmail (en), with a wrapped attribution line", () => {
    const text = [
      "Thanks, that fixed it!",
      "",
      "On Mon, Oct 13, 2026 at 10:02 AM Support Team via Acme <",
      "reply+abc@example.com> wrote:",
      "",
      "> Try clearing the cache.",
      ">",
    ].join("\r\n");
    expect(strip(text)).toBe("Thanks, that fixed it!");
  });

  it("Gmail (fr)", () => {
    const text = "Merci beaucoup !\n\nLe lun. 13 oct. 2026 à 10:02, Équipe Support <support@example.com> a écrit :\n> Bonjour,\n> Essayez de vider le cache.";
    expect(strip(text)).toBe("Merci beaucoup !");
  });

  it("Outlook header blocks, en and fr", () => {
    const en = "It still fails.\n\nFrom: Support <support@example.com>\nSent: Monday, October 13, 2026 10:02 AM\nTo: Ana <ana@example.com>\nSubject: RE: Login\n\nTry again";
    const fr = "Toujours pareil.\n\n________________________________\nDe : Support <support@example.com>\nEnvoyé : lundi 13 octobre 2026 10:02\nÀ : Ana <ana@example.com>\nObjet : RE: Connexion\n\nRéessayez";
    expect(strip(en)).toBe("It still fails.");
    expect(strip(fr)).toBe("Toujours pareil.");
  });

  it("Original Message separators", () => {
    expect(strip("Yes please.\n\n-----Original Message-----\nFrom: x\nolder")).toBe("Yes please.");
    expect(strip("Oui.\n-----Message d'origine-----\nDe : x")).toBe("Oui.");
  });

  it("signature and mobile footers", () => {
    expect(strip("See attached.\n\n-- \nAna Lopez\nCTO, Example\n+33 1 23 45 67 89")).toBe("See attached.");
    expect(strip("On my way.\n\nSent from my iPhone")).toBe("On my way.");
    expect(strip("J'arrive.\n\nEnvoyé de mon iPhone")).toBe("J'arrive.");
  });

  it("keeps an answer written between quotes, and a bare -- divider with a lot after it", () => {
    const inline = "> Which plan are you on?\nPro.\n> Since when?\nMarch.";
    expect(strip(inline)).toBe(inline);
    const divider = ["Steps:", "--", "1", "2", "3", "4", "5", "6", "7", "8", "9"].join("\n");
    expect(strip(divider)).toBe(divider);
  });

  it("doesn't cut a sentence that merely starts with On", () => {
    const text = "On Monday I wrote: the export fails.\nCan you check?";
    expect(strip(text)).toBe(text);
  });

  it("keeps the whole email when everything is quoted", () => {
    const text = "On Mon, Oct 13, 2026 Ana <ana@example.com> wrote:\n> hello";
    expect(stripQuotedReply(text)).toEqual({ text, stripped: false });
  });
});

describe("HTML to text", () => {
  it("drops scripts and styles, keeps links and decodes entities", () => {
    const html = `<html><head><style>p{color:red}</style></head><body><script>alert(1)</script>
      <p>Hello&nbsp;&amp; welcome &lt;3</p><p>See <a href="https://example.com/doc">the guide</a>.</p><ul><li>One</li><li>Two</li></ul></body></html>`;
    expect(htmlToText(html)).toBe("Hello & welcome <3\n\nSee the guide <https://example.com/doc>.\n\n- One\n- Two");
  });

  it("turns blockquotes into > lines so a Gmail HTML reply strips to its new part", () => {
    const html = `<div dir="ltr">Works now, thanks!</div><br><div class="gmail_quote"><div class="gmail_attr">On Mon, Oct 13, 2026 at 10:02 AM Support &lt;support@example.com&gt; wrote:<br></div><blockquote class="gmail_quote"><div>Clear the cache.</div></blockquote></div>`;
    const text = htmlToText(html);
    expect(text).toContain("> Clear the cache.");
    expect(stripQuotedReply(text).text).toBe("Works now, thanks!");
  });
});

describe("plain text part detection", () => {
  const raw = (s: string) => new TextEncoder().encode(s).buffer;
  it("knows an HTML-only email from one with a text part", () => {
    expect(hasPlainTextPart(raw("From: a@b.com\r\nContent-Type: text/html\r\n\r\n<p>x</p>"))).toBe(false);
    expect(hasPlainTextPart(raw("From: a@b.com\r\nContent-Type: multipart/alternative; boundary=x\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nx"))).toBe(true);
    expect(hasPlainTextPart(raw("From: a@b.com\r\nSubject: hi\r\n\r\nplain"))).toBe(true);
  });
});

describe("reply composition", () => {
  const base: ReplyInput = {
    body: "Hi Ana,\nThe <b>fix</b> is live & working.",
    attachments: [{ fileName: "invoice.pdf", url: "https://support.example.com/api/files/att_1?exp=1&sig=x" }],
    agentName: "Sam",
    senderName: "Acme Support",
    teamName: "Acme",
    fromAddress: "support@example.com",
    to: "ana@example.org",
    replyTo: "reply+abc.def@example.com",
    subject: "Login broken",
    brandColor: "#ff6600",
    locale: "en",
    thread: ["first@mail.example.org", "ours-1@example.com", "second@mail.example.org"],
    inReplyTo: "second@mail.example.org",
    messageIdLocal: "msg_1.r4nd",
  };

  it("threads: Message-ID on our domain, In-Reply-To the customer's last email, References the chain", () => {
    const email = composeReply(base);
    expect(email.messageId).toBe("msg_1.r4nd@example.com");
    expect(email.headers).toEqual({
      "In-Reply-To": "<second@mail.example.org>",
      References: "<first@mail.example.org> <ours-1@example.com> <second@mail.example.org>",
    });
    expect(email.subject).toBe("Re: Login broken");
    expect(email.replyTo).toBe("reply+abc.def@example.com");
    expect(email.from).toEqual({ email: "support@example.com", name: "Sam via Acme Support" });
  });

  it("first email of a thread has no threading headers", () => {
    expect(composeReply({ ...base, thread: [], inReplyTo: null }).headers).toEqual({});
  });

  it("keeps long reference chains under the header limit, with the first email and the newest ones", () => {
    const ids = Array.from({ length: 80 }, (_, i) => `message-number-${i}@mail.example.org`);
    const header = referencesHeader(ids, 400);
    expect(header.length).toBeLessThanOrEqual(400);
    expect(header.startsWith("<message-number-0@mail.example.org>")).toBe(true);
    expect(header.endsWith("<message-number-79@mail.example.org>")).toBe(true);
    expect(header).not.toContain("<message-number-40@");
  });

  it("subjects get one Re:, forwards become replies, empty ones a fallback", () => {
    expect(replySubject("Re: Login", "x")).toBe("Re: Login");
    expect(replySubject("RE[2]: Login", "x")).toBe("RE[2]: Login");
    expect(replySubject("Fwd: Login", "x")).toBe("Re: Login");
    expect(replySubject("  \r\n", "Your message to Acme")).toBe("Re: Your message to Acme");
  });

  it("escapes the message in HTML and keeps header fields single-line", () => {
    const email = composeReply({ ...base, agentName: 'Sam"\r\nBcc: x@evil.com', brandColor: "red;background:url(x)" });
    expect(email.html).toContain("The &lt;b&gt;fix&lt;/b&gt; is live &amp; working.");
    expect(email.html).not.toContain("<b>fix</b>");
    expect(email.html).not.toContain("url(x)");
    expect(email.html).toContain("#6d5dfc");
    expect(email.from.name).not.toMatch(/[\r\n"]/);
    expect(email.text).toContain("- invoice.pdf: https://support.example.com/api/files/att_1");
  });

  it("writes the footer in the customer's language", () => {
    expect(composeReply({ ...base, locale: "fr" }).text).toContain("Répondez à cet e-mail");
    expect(composeReply(base).text).toContain("Reply to this email");
  });

  it("guesses the customer's language", () => {
    expect(detectLocale([], "Bonjour, je n'arrive pas à me connecter avec mon compte. Merci")).toBe("fr");
    expect(detectLocale([], "Hi, I can't log in to my account. Thanks")).toBe("en");
    expect(detectLocale([header("content-language", "fr-FR")], "ok")).toBe("fr");
  });
});

describe("transports (only the network is faked)", () => {
  const email = composeReply({
    body: "Done.",
    attachments: [],
    agentName: "Sam",
    senderName: "Acme",
    teamName: "Acme",
    fromAddress: "support@example.com",
    to: "ana@example.org",
    replyTo: "reply+a.b@example.com",
    subject: "Help",
    brandColor: "#6d5dfc",
    locale: "en",
    thread: ["c1@example.org"],
    inReplyTo: "c1@example.org",
    messageIdLocal: "msg_9",
  });

  it("Resend gets our Message-ID and the threading headers", async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string | null } | null = null;
    const transport = resendTransport("re_key", async (url, init) => {
      sent = { url, body: JSON.parse(String(init.body)) as Record<string, unknown>, auth: new Headers(init.headers).get("authorization") };
      return new Response(JSON.stringify({ id: "resend-id" }), { status: 200 });
    });
    expect(await transport.send(email)).toEqual({ messageId: "msg_9@example.com" });
    expect(sent!.url).toBe("https://api.resend.com/emails");
    expect(sent!.auth).toBe("Bearer re_key");
    expect(sent!.body).toMatchObject({
      from: '"Sam via Acme" <support@example.com>',
      to: ["ana@example.org"],
      reply_to: "reply+a.b@example.com",
      subject: "Re: Help",
      headers: { "Message-ID": "<msg_9@example.com>", "In-Reply-To": "<c1@example.org>", References: "<c1@example.org>" },
    });
  });

  it("Resend: refused requests are permanent, rate limits and outages are retried", async () => {
    const failing = (status: number) => resendTransport("re_key", async () => new Response(JSON.stringify({ message: "nope" }), { status }));
    await expect(failing(422).send(email)).rejects.toMatchObject({ permanent: true, message: "Resend 422: nope" });
    await expect(failing(429).send(email)).rejects.toMatchObject({ permanent: false });
    await expect(failing(503).send(email)).rejects.toMatchObject({ permanent: false });
  });

  it("Cloudflare: no Message-ID header (the service sets it), keeps the one it returns, maps error codes", async () => {
    let builder: EmailMessageBuilder | null = null;
    const binding = {
      send: async (input: EmailMessage | EmailMessageBuilder) => {
        builder = input as EmailMessageBuilder;
        return { messageId: "<cf-123@example.com>" };
      },
    } as SendEmail;
    expect(await cloudflareTransport(binding).send(email)).toEqual({ messageId: "<cf-123@example.com>" });
    expect(builder!.headers).toEqual({ "In-Reply-To": "<c1@example.org>", References: "<c1@example.org>" });
    expect(builder!.replyTo).toBe("reply+a.b@example.com");

    const throwing = (code: string) =>
      cloudflareTransport({
        send: async () => {
          throw Object.assign(new Error("failed"), { code });
        },
      } as SendEmail);
    await expect(throwing("E_SENDER_NOT_VERIFIED").send(email)).rejects.toMatchObject({ permanent: true });
    await expect(throwing("E_RATE_LIMIT_EXCEEDED").send(email)).rejects.toBeInstanceOf(EmailSendError);
    await expect(throwing("E_RATE_LIMIT_EXCEEDED").send(email)).rejects.toMatchObject({ permanent: false });
  });
});

describe("delivery retries", () => {
  const now = 1_000_000;
  it("backs off, then gives up after the last attempt", () => {
    expect(nextEmailAttempt(1, false, now)).toEqual({ status: "pending", nextAttemptAt: now + 60_000 });
    expect(nextEmailAttempt(2, false, now)).toEqual({ status: "pending", nextAttemptAt: now + 5 * 60_000 });
    expect(nextEmailAttempt(EMAIL_MAX_ATTEMPTS - 1, false, now)).toEqual({ status: "pending", nextAttemptAt: now + 6 * 3600_000 });
    expect(nextEmailAttempt(EMAIL_MAX_ATTEMPTS, false, now)).toEqual({ status: "failed" });
  });

  it("gives up at once when retrying can't help", () => {
    expect(nextEmailAttempt(1, true, now)).toEqual({ status: "failed" });
  });
});

describe("provider choice", () => {
  it("auto prefers Cloudflare, an explicit choice needs its configuration", () => {
    expect(chooseProvider("auto", { cloudflare: true, resend: true })).toBe("cloudflare");
    expect(chooseProvider("auto", { cloudflare: false, resend: true })).toBe("resend");
    expect(chooseProvider("auto", { cloudflare: false, resend: false })).toBeNull();
    expect(chooseProvider("resend", { cloudflare: true, resend: true })).toBe("resend");
    expect(chooseProvider("resend", { cloudflare: true, resend: false })).toBeNull();
  });
});
