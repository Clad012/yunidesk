import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const write = (text: string) =>
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return { copied, write };
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const { copied, write } = useCopy();
  return (
    <Button type="button" size="xs" variant="outline" onClick={() => write(text)} className={className}>
      {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
      {copied ? copy.common.copied : copy.common.copy}
    </Button>
  );
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/50">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <CopyButton text={code} className="h-6" />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed scrollbar-thin">
        <code>{code}</code>
      </pre>
    </div>
  );
}
