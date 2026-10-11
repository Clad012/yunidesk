import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenIcon, CircleCheckIcon, CircleXIcon, FlaskConicalIcon, WrenchIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys, type AssistantPreview } from "@/lib/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageBody } from "@/features/inbox/conversation/timeline/message-body";
import { SettingsCard } from "../settings-page";

export function TryItCard() {
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");
  const preview = useMutation({
    mutationFn: endpoints.previewAssistant,
    // A test answer still spends from today's budget.
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.assistantUsage }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (question.trim()) preview.mutate(question.trim());
  };

  return (
    <SettingsCard
      title={copy.assistant.tryTitle}
      description={
        <span className="flex items-start gap-1.5">
          <FlaskConicalIcon className="mt-0.5 size-3.5 shrink-0" /> {copy.assistant.tryDescription}
        </span>
      }
    >
      <form onSubmit={submit} className="flex gap-2">
        <Input aria-label={copy.assistant.tryLabel} value={question} maxLength={2000} placeholder={copy.assistant.tryPlaceholder} onChange={(e) => setQuestion(e.target.value)} className="min-w-0 flex-1" />
        <Button type="submit" disabled={!question.trim() || preview.isPending}>
          {preview.isPending ? copy.assistant.asking : copy.assistant.ask}
        </Button>
      </form>
      {preview.isError ? <p className="text-sm text-destructive">{errorMessage(preview.error, copy.common.somethingWrong)}</p> : null}
      {preview.data ? <PreviewResult result={preview.data} /> : null}
    </SettingsCard>
  );
}

function PreviewResult({ result }: { result: AssistantPreview }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">{copy.assistant.tryReply}</p>
        <MessageBody text={result.reply} />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <BookOpenIcon className="size-3.5" /> {copy.assistant.trySources}
        </p>
        {result.sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">{copy.assistant.tryNoSources}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {result.sources.map((source) => (
              <Badge key={source.id} variant="secondary" className="font-normal">
                {source.title}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {result.toolCalls.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <WrenchIcon className="size-3.5" /> {copy.assistant.tryTools}
          </p>
          <ul className="flex flex-wrap gap-1">
            {result.toolCalls.map((call, i) => (
              <li key={`${call.name}:${i}`}>
                <Badge variant={call.ok ? "success" : "destructive"} className="font-normal">
                  {call.ok ? <CircleCheckIcon /> : <CircleXIcon />}
                  <code className="font-mono">{call.name}</code> {call.ok ? copy.assistant.toolOk : copy.assistant.toolFailed}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
