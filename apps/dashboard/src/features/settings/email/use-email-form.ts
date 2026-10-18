import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { EmailChannelPatch, EmailChannelSettings, EmailProviderSetting } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";

export interface EmailDraft {
  enabled: boolean;
  inboundAddress: string;
  fromName: string;
  fromAddress: string;
  provider: EmailProviderSetting;
}

const ADDRESS = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

function toDraft(saved: EmailChannelSettings): EmailDraft {
  return {
    enabled: saved.enabled,
    inboundAddress: saved.inboundAddress ?? "",
    fromName: saved.fromName ?? "",
    fromAddress: saved.fromAddress ?? "",
    provider: saved.provider,
  };
}

/** Only what changed; empty text fields clear the setting. The inbound address is left alone when the server sets it. */
function toPatch(saved: EmailChannelSettings, value: EmailDraft): EmailChannelPatch {
  const base = toDraft(saved);
  const patch: EmailChannelPatch = {};
  const text = (v: string) => v.trim() || null;
  if (value.enabled !== base.enabled) patch.enabled = value.enabled;
  if (value.provider !== base.provider) patch.provider = value.provider;
  if (value.fromName.trim() !== base.fromName) patch.fromName = text(value.fromName);
  if (value.fromAddress.trim() !== base.fromAddress) patch.fromAddress = text(value.fromAddress);
  if (!saved.inboundAddressFromEnv && value.inboundAddress.trim() !== base.inboundAddress) patch.inboundAddress = text(value.inboundAddress);
  return patch;
}

const addressError = (value: string) => (value.trim() && !ADDRESS.test(value.trim()) ? copy.emailChannel.badAddress : null);

export function useEmailForm(saved: EmailChannelSettings) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<EmailDraft>>({});
  const value: EmailDraft = { ...toDraft(saved), ...draft };
  const changes = toPatch(saved, value);
  const errors = { inboundAddress: addressError(value.inboundAddress), fromAddress: addressError(value.fromAddress) };

  const save = useMutation({
    mutationFn: () => endpoints.patchEmailChannel(changes),
    onSuccess: (next) => {
      qc.setQueryData(queryKeys.emailChannel, next);
      setDraft({});
      toast.success(copy.settings.savedToast);
    },
    onError: (error) => toast.error(errorMessage(error, copy.common.somethingWrong)),
  });

  return {
    value,
    errors,
    dirty: Object.keys(changes).length > 0,
    valid: !errors.inboundAddress && !errors.fromAddress,
    saving: save.isPending,
    set: <K extends keyof EmailDraft>(key: K, next: EmailDraft[K]) => setDraft((d) => ({ ...d, [key]: next })),
    save: () => save.mutate(),
    discard: () => setDraft({}),
  };
}

export type EmailForm = ReturnType<typeof useEmailForm>;
