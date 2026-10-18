import { useState } from "react";
import { getStrings, type LocalizedText } from "yunidesk";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SettingsCard } from "../settings-page";

type Lang = "en" | "fr";

interface AwayMessageCardProps {
  value: LocalizedText;
  disabled: boolean;
  onChange: (value: LocalizedText) => void;
}

/** The away message in English and French; empty falls back to the messenger's default copy. */
export function AwayMessageCard({ value, disabled, onChange }: AwayMessageCardProps) {
  const [lang, setLang] = useState<Lang>("en");
  return (
    <SettingsCard title={copy.businessHours.awayMessage} description={copy.businessHours.awayMessageHint}>
      <Tabs value={lang} onValueChange={(v) => setLang(v as Lang)}>
        <TabsList>
          <TabsTrigger value="en">{copy.messenger.english}</TabsTrigger>
          <TabsTrigger value="fr">{copy.messenger.french}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Field label={copy.businessHours.awayMessage}>
        {(id) => (
          <Textarea
            id={id}
            rows={3}
            maxLength={500}
            value={value[lang] ?? ""}
            placeholder={getStrings(lang).awayMessageDefault}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
          />
        )}
      </Field>
    </SettingsCard>
  );
}
