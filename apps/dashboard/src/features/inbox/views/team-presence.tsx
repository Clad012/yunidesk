import { copy } from "@/lib/copy";
import { presenceStore } from "@/lib/realtime/live";
import { useStore } from "@/lib/realtime/store";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { PersonAvatar } from "@/components/person-avatar";
import { Tip } from "@/components/ui/tooltip";

export function TeamPresence() {
  const { teammates } = useBootstrap();
  const online = useStore(presenceStore, (s) => s);
  const present = teammates.filter((t) => online.includes(t.id));
  if (present.length === 0) return null;
  return (
    <div className="mt-auto px-2">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{copy.views.teamOnline}</p>
      <div className="flex flex-wrap gap-1.5">
        {present.map((t) => (
          <Tip key={t.id} label={t.name}>
            <span>
              <PersonAvatar name={t.name} avatarUrl={t.avatarUrl} seed={t.id} online className="size-7" />
            </span>
          </Tip>
        ))}
      </div>
    </div>
  );
}
