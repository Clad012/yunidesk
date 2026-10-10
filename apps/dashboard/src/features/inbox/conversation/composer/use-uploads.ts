import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  formatBytes,
  isAllowedAttachmentType,
  isInlineImage,
  type Attachment,
} from "yunidesk";
import { toast } from "sonner";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

export interface PendingUpload {
  key: string;
  file: File;
  previewUrl: string | null;
  progress: number;
  attachment: Attachment | null;
  error: string | null;
}

function imageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Files attached to the draft: validated against the protocol limits, uploaded right away with progress. */
export function useUploads() {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const latest = useRef(uploads);
  latest.current = uploads;

  const update = (key: string, patch: Partial<PendingUpload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const upload = useCallback(async (item: PendingUpload) => {
    const controller = new AbortController();
    controllers.current.set(item.key, controller);
    const form = new FormData();
    form.append("file", item.file);
    if (item.previewUrl) {
      const size = await imageSize(item.previewUrl);
      if (size) {
        form.append("width", String(size.width));
        form.append("height", String(size.height));
      }
    }
    try {
      const attachment = await endpoints.upload(form, (progress) => update(item.key, { progress }), controller.signal);
      update(item.key, { attachment, progress: 1 });
    } catch (error) {
      if (!controller.signal.aborted) update(item.key, { error: errorMessage(error, copy.composer.uploadFailed) });
    } finally {
      controllers.current.delete(item.key);
    }
  }, []);

  const add = useCallback(
    (files: File[]) => {
      const room = MAX_ATTACHMENTS_PER_MESSAGE - latest.current.length;
      if (files.length > room) toast.error(fmt(copy.composer.tooMany, { n: MAX_ATTACHMENTS_PER_MESSAGE }));
      const accepted: PendingUpload[] = [];
      for (const file of files.slice(0, Math.max(0, room))) {
        if (!isAllowedAttachmentType(file.type)) {
          toast.error(fmt(copy.composer.badType, { name: file.name || file.type }));
        } else if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(fmt(copy.composer.tooLarge, { name: file.name, max: formatBytes(MAX_ATTACHMENT_BYTES) }));
        } else {
          const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const previewUrl = isInlineImage(file.type) ? URL.createObjectURL(file) : null;
          accepted.push({ key, file, previewUrl, progress: 0, attachment: null, error: null });
        }
      }
      if (accepted.length === 0) return;
      setUploads((list) => [...list, ...accepted]);
      for (const item of accepted) void upload(item);
    },
    [upload],
  );

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    setUploads((list) => {
      const item = list.find((u) => u.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return list.filter((u) => u.key !== key);
    });
  }, []);

  /** Hands over finished attachments and empties the tray (preview URLs live on in the optimistic message). */
  const take = useCallback((): Attachment[] => {
    const done = latest.current.flatMap((u) =>
      u.attachment ? [{ ...u.attachment, url: u.previewUrl ?? u.attachment.url }] : [],
    );
    setUploads([]);
    return done;
  }, []);

  const retry = useCallback((key: string) => {
    const item = latest.current.find((u) => u.key === key);
    if (!item) return;
    update(key, { error: null, progress: 0 });
    void upload(item);
  }, [upload]);

  useEffect(() => () => controllers.current.forEach((c) => c.abort()), []);

  const busy = uploads.some((u) => !u.attachment && !u.error);
  const ready = uploads.filter((u) => u.attachment).length;
  return { uploads, add, remove, take, retry, busy, ready, hasErrors: uploads.some((u) => u.error) };
}
