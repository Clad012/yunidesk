import { CheckCircle2Icon } from "lucide-react";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { CodeBlock } from "../code-block";
import { SaveBar, SettingsCard, SettingsPage } from "../settings-page";
import { useSettingsForm } from "../use-settings-form";
import { WebhookSecret } from "./webhook-secret";

const EVENTS = [
  ["conversation.created", copy.webhooks.event_created],
  ["message.created", copy.webhooks.event_message],
  ["conversation.updated", copy.webhooks.event_updated],
  ["conversation.rated", copy.webhooks.event_rated],
  ["conversation.unread_reply", copy.webhooks.event_unread],
] as const;

const VERIFY_SNIPPET = `import { verifyWebhookSignature } from "yunidesk/webhooks";

const rawBody = await request.text();
const ok = await verifyWebhookSignature(process.env.WEBHOOK_SECRET, request.headers.get("X-Yunidesk-Signature"), rawBody);
if (!ok) return new Response("Bad signature", { status: 401 });
const { event, data } = JSON.parse(rawBody);`;

function validUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function WebhooksSection() {
  const form = useSettingsForm(["webhookUrl"] as const);
  const url = form.value.webhookUrl ?? "";
  const invalid = url !== "" && !validUrl(url);
  return (
    <SettingsPage title={copy.webhooks.title} subtitle={copy.webhooks.subtitle} ownerOnly={!form.isOwner}>
      <SettingsCard>
        <Field label={copy.webhooks.url} hint={copy.webhooks.urlHint} error={invalid ? copy.webhooks.urlHint : null}>
          {(id) => (
            <Input id={id} type="url" value={url} placeholder={copy.webhooks.urlPlaceholder} disabled={!form.isOwner} onChange={(e) => form.set("webhookUrl", e.target.value.trim() || null)} className="font-mono text-xs" />
          )}
        </Field>
      </SettingsCard>
      <SettingsCard title={copy.webhooks.secret}>
        <WebhookSecret hasSecret={form.value.hasWebhookSecret} disabled={!form.isOwner} />
      </SettingsCard>
      <SettingsCard title={copy.webhooks.events}>
        <ul className="flex flex-col gap-2">
          {EVENTS.map(([name, label]) => (
            <li key={name} className="flex items-start gap-2.5 text-sm">
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
              <span>
                <code className="text-xs font-medium">{name}</code>
                <span className="block text-muted-foreground">{label}</span>
              </span>
            </li>
          ))}
        </ul>
      </SettingsCard>
      <SettingsCard title={copy.webhooks.signature} description={copy.webhooks.signatureHint}>
        <CodeBlock code={VERIFY_SNIPPET} label="TS" />
      </SettingsCard>
      <SaveBar dirty={form.dirty && !invalid} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
    </SettingsPage>
  );
}
