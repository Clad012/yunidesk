import type { KnowledgeItem, Locale } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleRow } from "../toggle-row";

const NOT_LINKED = "none";
const SLUG_INPUT = /[^a-z0-9-]/g;

export interface HelpCenterDraft {
  slug: string;
  category: string;
  published: boolean;
  position: number;
  /** undefined: not touched (keep whatever link the item has). */
  translationOf: string | null | undefined;
}

interface HelpCenterFieldsProps {
  draft: HelpCenterDraft;
  locale: Locale | null;
  /** The item being edited (null when adding one). */
  current: KnowledgeItem | null;
  /** Every knowledge item, for categories and translation candidates. */
  items: readonly KnowledgeItem[];
  onChange: (patch: Partial<HelpCenterDraft>) => void;
}

/** The item linked as this one's translation today: another item in its translation group. */
export function linkedTranslation(current: KnowledgeItem | null, items: readonly KnowledgeItem[]): string | null {
  if (!current?.translationGroup) return null;
  return items.find((i) => i.id !== current.id && i.translationGroup === current.translationGroup)?.id ?? null;
}

/** Slug, category, order, published and translation link of a knowledge item. */
export function HelpCenterFields({ draft, locale, current, items, onChange }: HelpCenterFieldsProps) {
  const categories = [...new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))].sort();
  const candidates = items.filter((i) => i.id !== current?.id && i.locale !== null && i.locale !== locale);
  const translation = draft.translationOf === undefined ? linkedTranslation(current, items) : draft.translationOf;

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted/40 p-4">
      <ToggleRow
        label={copy.helpCenter.published}
        hint={copy.helpCenter.publishedHint}
        checked={draft.published}
        disabled={false}
        onChange={(published) => onChange({ published })}
      />
      <Field label={copy.helpCenter.slug} hint={fmt(copy.helpCenter.slugHint, { locale: locale ?? "en", slug: draft.slug || "…" })}>
        {(id) => (
          <Input
            id={id}
            maxLength={80}
            className="font-mono"
            placeholder={copy.helpCenter.slugPlaceholder}
            value={draft.slug}
            onChange={(e) => onChange({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(SLUG_INPUT, "") })}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <Field label={copy.helpCenter.category}>
          {(id) => (
            <>
              <Input
                id={id}
                maxLength={60}
                list={`${id}-categories`}
                placeholder={copy.helpCenter.categoryPlaceholder}
                value={draft.category}
                onChange={(e) => onChange({ category: e.target.value })}
              />
              <datalist id={`${id}-categories`}>
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label={copy.helpCenter.position} hint={copy.helpCenter.positionHint}>
          {(id) => (
            <Input
              id={id}
              type="number"
              step={1}
              value={String(draft.position)}
              onChange={(e) => onChange({ position: Number.parseInt(e.target.value, 10) || 0 })}
            />
          )}
        </Field>
      </div>
      <Field label={copy.helpCenter.translationOf} hint={locale ? copy.helpCenter.translationHint : copy.helpCenter.translationNeedsLanguage}>
        {(id) => (
          <Select
            value={translation ?? NOT_LINKED}
            disabled={!locale}
            onValueChange={(v) => onChange({ translationOf: v === NOT_LINKED ? null : v })}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOT_LINKED}>{copy.helpCenter.translationNone}</SelectItem>
              {candidates.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title} · {copy.knowledge[`language_${item.locale!}`]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </div>
  );
}
