import type { ApiKey } from "yunidesk";
import { BotIcon } from "lucide-react";
import { copy, fmt } from "@/lib/copy";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RevokeApiKeyButton } from "./revoke-api-key-button";

function expiryLabel(expiresAt: number | null, now: number): string {
  if (expiresAt === null) return copy.apiKeys.noExpiry;
  return fmt(expiresAt <= now ? copy.apiKeys.expired : copy.apiKeys.expires, { date: formatDateTime(expiresAt) });
}

export function ApiKeyRow({ apiKey, now, onRevoke }: { apiKey: ApiKey; now: number; onRevoke: () => void }) {
  const revoked = apiKey.revokedAt !== null;
  const expired = apiKey.expiresAt !== null && apiKey.expiresAt <= now;
  const meta = [
    fmt(copy.apiKeys.created, { date: formatDateTime(apiKey.createdAt) }),
    apiKey.lastUsedAt === null ? copy.apiKeys.neverUsed : fmt(copy.apiKeys.lastUsed, { time: formatDateTime(apiKey.lastUsedAt) }),
    expiryLabel(apiKey.expiresAt, now),
  ];

  return (
    <li className={cn("flex items-start gap-3 py-3.5", revoked && "opacity-55")}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-medium">{apiKey.name}</p>
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{apiKey.prefix}…</code>
          {revoked ? <Badge variant="destructive">{copy.apiKeys.revoked}</Badge> : null}
          {!revoked && expired ? <Badge variant="warning">{expiryLabel(apiKey.expiresAt, now)}</Badge> : null}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BotIcon className="size-3.5" /> {fmt(copy.apiKeys.botName, { name: apiKey.bot.name })}
        </p>
        <div className="flex flex-wrap gap-1">
          {apiKey.scopes.map((scope) => (
            <Badge key={scope} variant="secondary" className="font-mono text-[11px] font-normal">
              {scope}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
      </div>
      {revoked ? null : <RevokeApiKeyButton name={apiKey.name} onConfirm={onRevoke} />}
    </li>
  );
}
