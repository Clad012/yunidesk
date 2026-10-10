import { copy } from "@/lib/copy";
import { useStore } from "@/lib/realtime/store";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { shortcutsOpenStore } from "./shortcuts-store";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const ROWS: { keys: string[]; label: string }[] = [
  { keys: ["j"], label: copy.shortcuts.next },
  { keys: ["k"], label: copy.shortcuts.previous },
  { keys: ["e"], label: copy.shortcuts.resolve },
  { keys: ["r"], label: copy.shortcuts.reply },
  { keys: ["n"], label: copy.shortcuts.note },
  { keys: ["/"], label: copy.shortcuts.search },
  { keys: [isMac ? "⌘" : "Ctrl", "Enter"], label: copy.shortcuts.send },
  { keys: ["Esc"], label: copy.shortcuts.close },
  { keys: ["?"], label: copy.shortcuts.help },
];

export function ShortcutsDialog() {
  const open = useStore(shortcutsOpenStore, (s) => s);
  useHotkeys({ "?": () => shortcutsOpenStore.set(true) });
  return (
    <Dialog open={open} onOpenChange={(next) => shortcutsOpenStore.set(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.shortcuts.title}</DialogTitle>
          <DialogDescription className="sr-only">{copy.shortcuts.title}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {ROWS.map((row) => (
            <li key={row.label} className="flex items-center justify-between rounded-lg px-1 py-1.5 text-sm">
              <span>{row.label}</span>
              <span className="flex gap-1">
                {row.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
