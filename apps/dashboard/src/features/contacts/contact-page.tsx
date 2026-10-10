import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { ApiError } from "@/lib/api";
import { BlurFade } from "@/components/magicui/blur-fade";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactActions } from "./contact-actions";
import { ContactDetails, ContactSummary } from "./contact-details";
import { ConversationLinkList } from "./conversation-link-list";
import { useContactDetail } from "./use-contact";

export function ContactPage() {
  const { contactId } = useParams({ strict: false }) as { contactId: string };
  const navigate = useNavigate();
  const detail = useContactDetail(contactId);

  return (
    <div className="m-2 flex h-[calc(100%-1rem)] flex-col overflow-y-auto rounded-xl border bg-card shadow-xs scrollbar-thin">
      <header className="flex items-center gap-2 border-b px-6 py-3">
        <Link to="/contacts" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> {copy.contacts.back}
        </Link>
      </header>
      {detail.isError ? (
        <p className="p-10 text-center text-sm text-muted-foreground">
          {detail.error instanceof ApiError && detail.error.status === 404 ? copy.contacts.notFound : copy.common.somethingWrong}
        </p>
      ) : !detail.data ? (
        <div className="flex flex-col gap-4 p-8"><Skeleton className="h-12 w-64" /><Skeleton className="h-40 w-full max-w-lg" /></div>
      ) : (
        <BlurFade className="grid gap-8 p-8 lg:grid-cols-[22rem_1fr]">
          <div className="flex flex-col gap-6">
            <ContactSummary contact={detail.data.contact} />
            <ContactDetails contact={detail.data.contact} />
            <ContactActions contact={detail.data.contact} onDeleted={() => void navigate({ to: "/contacts" })} />
          </div>
          <section>
            <h2 className="mb-3 text-sm font-semibold">{copy.contacts.conversations}</h2>
            <div className="rounded-xl border p-1.5">
              <ConversationLinkList conversations={detail.data.conversations} empty={copy.contacts.noConversations} />
            </div>
          </section>
        </BlurFade>
      )}
    </div>
  );
}
