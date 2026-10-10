import { useCallback, useEffect, useRef, useState } from "react";
import { isInlineImage, type Attachment, type SupportStrings } from "yunidesk";
import type { SupportClient } from "yunidesk/client";
import { checkFiles, effectiveType, readImageSize } from "../lib/files";
import { localImageSizes } from "../state/useActions";

export interface UploadItem {
  key: string;
  file: File;
  name: string;
  size: number;
  /** Object URL for image thumbnails. */
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "done" | "error";
  attachment: Attachment | null;
}

const ERROR_MS = 6000;
let seq = 0;

/** Files in the composer: checks, uploads with progress, removal, retry. */
export function useUploads(client: SupportClient, strings: SupportStrings) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const controllers = useRef(new Map<string, AbortController>());
  const errorTimer = useRef<number | undefined>(undefined);

  const patch = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const start = useCallback(
    (item: UploadItem) => {
      const controller = new AbortController();
      controllers.current.set(item.key, controller);
      // Measure images first so the server stores their size and every client reserves the space.
      const measured = item.previewUrl ? readImageSize(item.file) : Promise.resolve(null);
      measured
        .then((size) =>
          client.uploadAttachment(item.file, {
            fileName: item.name,
            signal: controller.signal,
            ...(size ? { width: size.width, height: size.height } : {}),
            onProgress: (fraction) => patch(item.key, { progress: Math.min(0.98, fraction) }),
          }).then((attachment) => {
            if (size) localImageSizes.set(attachment.id, size);
            const withSize = { ...attachment, width: attachment.width ?? size?.width ?? null, height: attachment.height ?? size?.height ?? null };
            patch(item.key, { status: "done", progress: 1, attachment: withSize });
          }),
        )
        .catch(() => {
          if (!controller.signal.aborted) patch(item.key, { status: "error" });
        })
        .finally(() => controllers.current.delete(item.key));
    },
    [client, patch],
  );

  const showErrors = useCallback((list: string[]) => {
    window.clearTimeout(errorTimer.current);
    setErrors(list);
    if (list.length) errorTimer.current = window.setTimeout(() => setErrors([]), ERROR_MS);
  }, []);

  const add = useCallback(
    (files: readonly File[]) => {
      const { accepted, errors: problems } = checkFiles(files, itemsRef.current.length, strings);
      showErrors(problems);
      const next = accepted.map<UploadItem>((file) => ({
        key: `u${++seq}`,
        file,
        name: file.name || "file",
        size: file.size,
        previewUrl: isInlineImage(effectiveType(file)) ? URL.createObjectURL(file) : null,
        progress: 0,
        status: "uploading",
        attachment: null,
      }));
      if (!next.length) return;
      setItems((list) => [...list, ...next]);
      next.forEach(start);
    },
    [start, strings, showErrors],
  );

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    setItems((list) => {
      const item = list.find((i) => i.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return list.filter((i) => i.key !== key);
    });
  }, []);

  const retry = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (!item) return;
      patch(key, { status: "uploading", progress: 0 });
      start(item);
    },
    [patch, start],
  );

  /** After a send: the message now carries the attachments. */
  const clear = useCallback(() => {
    itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    showErrors([]);
  }, [showErrors]);

  useEffect(
    () => () => {
      controllers.current.forEach((c) => c.abort());
      itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      window.clearTimeout(errorTimer.current);
    },
    [],
  );

  const ready = items.flatMap((item) => (item.status === "done" && item.attachment ? [item.attachment] : []));
  const busy = items.some((item) => item.status === "uploading");
  return { items, errors, add, remove, retry, clear, ready, busy, hasErrors: items.some((i) => i.status === "error") };
}

export type Uploads = ReturnType<typeof useUploads>;
