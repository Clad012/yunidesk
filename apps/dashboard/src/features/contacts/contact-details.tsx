import type { Contact } from "yunidesk";
import { BadgeCheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { formatDateTime } from "@/lib/time";
import { PersonAvatar } from "@/components/person-avatar";
import { ChannelIcon } from "@/components/channel-icon";
import { contactLabel } from "@/features/inbox/lib/labels";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function attributeValue(value: Contact["attributes"][string]): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? copy.common.yes : copy.common.no;
  return String(value);
}

export function ContactSummary({ contact }: { contact: Contact }) {
  return (
    <div className="flex items-center gap-3">
      <PersonAvatar name={contactLabel(contact)} avatarUrl={contact.avatarUrl} online={contact.online} seed={contact.id} className="size-11" />
      <div className="min-w-0">
        <p className="truncate font-semibold">{contactLabel(contact)}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {contact.isIdentified ? <BadgeCheckIcon className="size-3.5 text-primary" /> : null}
          {contact.isIdentified ? copy.contactPanel.identified : copy.contactPanel.anonymous}
        </p>
      </div>
    </div>
  );
}

export function ContactDetails({ contact }: { contact: Contact }) {
  const attributes = Object.entries(contact.attributes);
  return (
    <div className="flex flex-col gap-4">
      <dl>
        <Row label={copy.contactPanel.email}>
          {contact.email ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <a href={`mailto:${contact.email}`} className="truncate hover:underline">{contact.email}</a>
              {!contact.emailVerified ? (
                <span title={copy.contactPanel.unverifiedHint} className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  {copy.contactPanel.unverified}
                </span>
              ) : null}
            </span>
          ) : (
            "—"
          )}
        </Row>
        {contact.externalId ? <Row label={copy.contactPanel.externalId}><span className="font-mono text-xs">{contact.externalId}</span></Row> : null}
        <Row label={copy.contactPanel.status}>
          <span className="flex items-center gap-1.5">
            <span className={contact.online ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-muted-foreground/40"} />
            {contact.online ? copy.contactPanel.online : copy.contactPanel.offline}
          </span>
        </Row>
        {contact.lastChannel ? (
          <Row label={copy.contactPanel.channel}>
            <span className="flex items-center gap-1.5">
              <ChannelIcon channel={contact.lastChannel} className="size-3.5 text-muted-foreground" />
              {copy.list[`channel_${contact.lastChannel}`]}
            </span>
          </Row>
        ) : null}
        <Row label={copy.contactPanel.firstSeen}>{formatDateTime(contact.createdAt)}</Row>
        <Row label={copy.contactPanel.lastSeen}>{contact.lastSeenAt ? formatDateTime(contact.lastSeenAt) : copy.common.never}</Row>
      </dl>
      <section>
        <h4 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{copy.contactPanel.attributes}</h4>
        {attributes.length ? (
          <dl>
            {attributes.map(([key, value]) => (
              <Row key={key} label={key}>{attributeValue(value)}</Row>
            ))}
          </dl>
        ) : (
          <p className="py-1.5 text-sm text-muted-foreground">{copy.contactPanel.noAttributes}</p>
        )}
      </section>
    </div>
  );
}
