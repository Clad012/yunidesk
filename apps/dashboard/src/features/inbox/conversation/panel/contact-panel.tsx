import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentConversation } from "yunidesk";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { BlurFade } from "@/components/magicui/blur-fade";
import { ContactActions } from "@/features/contacts/contact-actions";
import { ContactDetails, ContactSummary } from "@/features/contacts/contact-details";
import { ConversationLinkList } from "@/features/contacts/conversation-link-list";
import { useContactDetail } from "@/features/contacts/use-contact";
import { useInboxParams } from "../../lib/use-inbox-params";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t px-5 py-4">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

interface ContactPanelProps {
  conversation: AgentConversation;
  overlay: boolean;
  onClose: () => void;
}

export function ContactPanel({ conversation, overlay, onClose }: ContactPanelProps) {
  const { view } = useInboxParams();
  const navigate = useNavigate();
  const detail = useContactDetail(conversation.contact.id);
  const contact = detail.data?.contact ?? conversation.contact;
  const others = (detail.data?.conversations ?? []).filter((c) => c.id !== conversation.id);

  return (
    <aside
      className={cn(
        "flex w-80 shrink-0 flex-col overflow-y-auto border-l bg-card scrollbar-thin",
        overlay && "absolute top-14 right-0 bottom-0 z-20 rounded-bl-xl shadow-2xl animate-in slide-in-from-right-4 fade-in-0 duration-200",
      )}
      aria-label={copy.contactPanel.title}
      onKeyDown={(e) => overlay && e.key === "Escape" && onClose()}
    >
      <BlurFade className="flex flex-col">
        <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-4">
          <ContactSummary contact={contact} />
          <span className="flex items-center gap-1">
            <Link to="/contacts/$contactId" params={{ contactId: contact.id }} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={copy.conversation.openContact}>
              <ExternalLinkIcon className="size-4" />
            </Link>
            {overlay ? (
              <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={copy.contactPanel.collapse}>
                <XIcon className="size-4" />
              </button>
            ) : null}
          </span>
        </div>
        <div className="px-5 pb-4">
          <ContactDetails contact={contact} />
        </div>
        <Section title={copy.contactPanel.otherConversations}>
          {detail.isPending ? <Skeleton className="h-8 w-full" /> : <ConversationLinkList conversations={others} empty={copy.contactPanel.noOtherConversations} />}
        </Section>
        <Section title={copy.settings.sections.privacy}>
          <ContactActions contact={contact} onDeleted={() => void navigate({ to: "/inbox/$view", params: { view } })} />
        </Section>
      </BlurFade>
    </aside>
  );
}
