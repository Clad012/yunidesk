import type { WebhookEndpoint } from "yunidesk";
import { HistoryIcon, KeyRoundIcon, MoreHorizontalIcon, PowerIcon, SendIcon, Trash2Icon } from "lucide-react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type EndpointAction = "test" | "deliveries" | "roll" | "toggle" | "delete";

export function EndpointRow({ endpoint, onAction }: { endpoint: WebhookEndpoint; onAction: (action: EndpointAction) => void }) {
  const enabled = endpoint.status === "enabled";
  const allEvents = endpoint.events.includes("*");
  return (
    <li className="flex items-start gap-3 py-3.5">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", enabled ? "bg-success" : "bg-muted-foreground/40")} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 truncate font-mono text-xs font-medium" title={endpoint.url}>
            {endpoint.url}
          </code>
          <Badge variant={enabled ? "success" : "secondary"}>{enabled ? copy.endpoints.enabled : copy.endpoints.disabled}</Badge>
        </div>
        {endpoint.description ? <p className="truncate text-sm text-muted-foreground">{endpoint.description}</p> : null}
        {!enabled && endpoint.disabledReason ? <p className="text-xs text-destructive">{endpoint.disabledReason}</p> : null}
        <div className="flex flex-wrap items-center gap-1">
          {allEvents ? (
            <Badge variant="default">{copy.endpoints.allEvents}</Badge>
          ) : (
            endpoint.events.map((e) => (
              <Badge key={e} variant="secondary" className="font-mono text-[11px] font-normal">
                {e}
              </Badge>
            ))
          )}
          {endpoint.apiKeyId ? (
            <span className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
              <KeyRoundIcon className="size-3" /> {copy.endpoints.byApiKey}
            </span>
          ) : null}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-xs" variant="ghost" aria-label={copy.endpoints.actions}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!enabled} onSelect={() => onAction("test")}>
            <SendIcon /> {copy.endpoints.sendTest}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction("deliveries")}>
            <HistoryIcon /> {copy.endpoints.showDeliveries}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction("roll")}>
            <KeyRoundIcon /> {copy.endpoints.rollSecret}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction("toggle")}>
            <PowerIcon /> {enabled ? copy.endpoints.disable : copy.endpoints.enable}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onAction("delete")}>
            <Trash2Icon /> {copy.common.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
