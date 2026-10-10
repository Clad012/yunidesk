import { Paperclip } from "lucide-react";
import { useMessenger } from "../../state/context";

export function DropOverlay() {
  const { strings } = useMessenger();
  return (
    <div className="ys-fade pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-surface/85 p-3 backdrop-blur-[2px]">
      <div className="flex size-full flex-col items-center justify-center gap-3 rounded-2xl bg-soft text-ink">
        <span className="ys-pop flex size-14 items-center justify-center rounded-full bg-brand text-on-brand">
          <Paperclip className="size-6" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-fg">{strings.dropToAttach}</p>
      </div>
    </div>
  );
}
