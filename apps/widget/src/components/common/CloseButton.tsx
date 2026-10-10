import { X } from "lucide-react";
import { useMessenger } from "../../state/context";
import { IconButton } from "./IconButton";

/** Only when there is no launcher to close with (full screen, or hideDefaultLauncher). */
export function CloseButton({ tone = "plain" }: { tone?: "plain" | "onBrand" }) {
  const { showCloseButton, closePanel, strings } = useMessenger();
  if (!showCloseButton) return null;
  return (
    <IconButton label={strings.closeMessenger} tone={tone} onClick={closePanel}>
      <X className="size-5" aria-hidden="true" />
    </IconButton>
  );
}
