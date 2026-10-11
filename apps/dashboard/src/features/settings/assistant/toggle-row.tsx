import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";

interface ToggleRowProps {
  label: string;
  hint: ReactNode;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleRow({ label, hint, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </label>
  );
}
