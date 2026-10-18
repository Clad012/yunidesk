import { SUPPORTED_LOCALES, type KnowledgeInput, type KnowledgeItem, type Locale } from "yunidesk";
import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHelpCenterLink } from "../help-center/help-center-url";
import { HelpCenterFields, type HelpCenterDraft } from "./help-center-fields";

type Kind = KnowledgeInput["kind"];
const KINDS: readonly Kind[] = ["faq", "article"];
const ALL_LANGUAGES = "all";

interface KnowledgeDialogProps {
  initial: KnowledgeItem | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: KnowledgeInput) => void;
}

export function KnowledgeDialog({ initial, saving, error, onClose, onSave }: KnowledgeDialogProps) {
  const [draft, setDraft] = useState<KnowledgeInput>(() => ({
    kind: initial?.kind ?? "faq",
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    locale: initial?.locale ?? null,
  }));
  const [help, setHelp] = useState<HelpCenterDraft>(() => ({
    slug: initial?.slug ?? "",
    category: initial?.category ?? "",
    published: initial?.published ?? true,
    position: initial?.position ?? 0,
    translationOf: undefined,
  }));
  // Every item (the unsearched list), for categories and translation links.
  const all = useQuery({ queryKey: queryKeys.knowledge(""), queryFn: () => endpoints.knowledge("") });
  const viewUrl = useHelpCenterLink(initial);
  const faq = draft.kind === "faq";
  const complete = draft.title.trim() !== "" && draft.body.trim() !== "";
  const setKind = (kind: Kind) => {
    setDraft((d) => ({ ...d, kind }));
    // New items: FAQ entries start public, articles private (until the owner says otherwise).
    if (!initial) setHelp((h) => ({ ...h, published: kind === "faq" }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!complete) return;
    const slug = help.slug.replace(/^-+|-+$/g, "");
    onSave({
      kind: draft.kind,
      title: draft.title.trim(),
      body: draft.body.trim(),
      locale: draft.locale ?? null,
      ...(slug && slug !== initial?.slug ? { slug } : {}),
      category: help.category.trim() || null,
      published: help.published,
      position: help.position,
      ...(help.translationOf !== undefined ? { translationOf: help.translationOf } : {}),
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{initial ? copy.knowledge.editTitle : copy.knowledge.newTitle}</DialogTitle>
            <DialogDescription>{copy.knowledge.dialogDescription}</DialogDescription>
          </DialogHeader>
          <Field label={copy.knowledge.kind}>
            {(id) => (
              <Select value={draft.kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger id={id} className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {copy.knowledge[`kind_${kind}`]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={copy.knowledge.language}>
            {(id) => (
              <Select
                value={draft.locale ?? ALL_LANGUAGES}
                onValueChange={(v) => setDraft((d) => ({ ...d, locale: v === ALL_LANGUAGES ? null : (v as Locale) }))}
              >
                <SelectTrigger id={id} className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_LANGUAGES}>{copy.knowledge.language_all}</SelectItem>
                  {SUPPORTED_LOCALES.map((locale) => (
                    <SelectItem key={locale} value={locale}>
                      {copy.knowledge[`language_${locale}`]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={faq ? copy.knowledge.question : copy.knowledge.articleTitle}>
            {(id) => <Input id={id} required maxLength={200} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />}
          </Field>
          <Field label={faq ? copy.knowledge.answer : copy.knowledge.content} error={error}>
            {(id) => <Textarea id={id} required maxLength={20000} rows={faq ? 5 : 12} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />}
          </Field>
          <HelpCenterFields
            draft={help}
            locale={draft.locale ?? null}
            current={initial}
            items={all.data?.items ?? []}
            onChange={(patch) => setHelp((h) => ({ ...h, ...patch }))}
          />
          <DialogFooter>
            {viewUrl ? (
              <Button type="button" variant="link" className="mr-auto px-0" asChild>
                <a href={viewUrl} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon /> {copy.helpCenter.view}
                </a>
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose}>
              {copy.common.cancel}
            </Button>
            <Button type="submit" disabled={saving || !complete}>
              {saving ? copy.common.saving : copy.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
