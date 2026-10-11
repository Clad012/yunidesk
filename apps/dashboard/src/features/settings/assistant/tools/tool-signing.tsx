import { KeyRoundIcon } from "lucide-react";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "../../code-block";
import { ConfirmDialog } from "../../confirm-dialog";
import { RevealedSecret } from "../../revealed-secret";

const VERIFY_SNIPPET = `import { verifyWebhookSignature } from "yunidesk/webhooks";
import type { AssistantToolCall } from "yunidesk";

const rawBody = await request.text();
const ok = await verifyWebhookSignature(process.env.ASSISTANT_TOOL_SECRET, request.headers.get("X-Yunidesk-Signature"), rawBody);
if (!ok) return new Response("Bad signature", { status: 401 });

// { id, tool, arguments, conversationId, contact: { id, externalId, email, name, isIdentified }, createdAt }
const call = JSON.parse(rawBody) as AssistantToolCall;
if (call.tool === "get_order_status") {
  // Only trust contact.externalId when contact.isIdentified is true.
  const order = await findOrder(call.contact.externalId, call.arguments.orderId);
  return Response.json({ status: order.status, trackingUrl: order.trackingUrl }); // within 8 s
}
return Response.json({ error: "unknown tool" }, { status: 404 });`;

interface ToolSigningProps {
  editable: boolean;
  rolling: boolean;
  onRoll: (onSecret: (secret: string) => void) => void;
}

/** The secret tool calls are signed with, and how to check a call on your server. */
export function ToolSigning({ editable, rolling, onRoll }: ToolSigningProps) {
  const [confirm, setConfirm] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{copy.assistantTools.secret}</p>
          <p className="text-xs text-muted-foreground">{copy.assistantTools.secretHint}</p>
        </div>
        {editable ? (
          <Button size="sm" variant="outline" disabled={rolling} onClick={() => setConfirm(true)}>
            <KeyRoundIcon /> {copy.assistantTools.rollSecret}
          </Button>
        ) : null}
      </div>
      {secret ? <RevealedSecret value={secret} warning={copy.assistantTools.secretShown} label={copy.assistantTools.secret} /> : null}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{copy.assistantTools.verify}</p>
        <p className="text-xs text-muted-foreground">{copy.assistantTools.verifyHint}</p>
        <CodeBlock code={VERIFY_SNIPPET} label="TS" />
      </div>
      <ConfirmDialog
        open={confirm}
        title={copy.assistantTools.rollTitle}
        body={copy.assistantTools.rollBody}
        action={copy.assistantTools.rollSecret}
        onOpenChange={setConfirm}
        onConfirm={() => onRoll(setSecret)}
      />
    </div>
  );
}
