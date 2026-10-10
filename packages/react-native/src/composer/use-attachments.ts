import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_ATTACHMENTS_PER_MESSAGE, type Attachment } from "yunidesk";
import { describeProblem, toUploadSource, validatePicked, type PickedFile } from "../logic/attachments";
import { useSupportCore } from "../provider/support-context";
import type { PickSource } from "./attachment-picker";

export interface DraftAttachment {
  key: string;
  file: PickedFile;
  /** 0..1 */
  progress: number;
  status: "uploading" | "done" | "failed";
  attachment: Attachment | null;
}

const NOTICE_MS = 4000;
let nextKey = 0;

/** Picks, validates and uploads files for the next message, with progress per file. */
export function useAttachments() {
  const { client, strings, attachmentPicker: picker } = useSupportCore();
  const [drafts, setDrafts] = useState<DraftAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());

  const update = useCallback((key: string, patch: Partial<DraftAttachment>) => {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }, []);

  const upload = useCallback(
    (draft: DraftAttachment) => {
      const controller = new AbortController();
      controllers.current.set(draft.key, controller);
      client
        .uploadAttachment(toUploadSource(draft.file), {
          width: draft.file.width ?? undefined,
          height: draft.file.height ?? undefined,
          signal: controller.signal,
          onProgress: (progress) => update(draft.key, { progress }),
        })
        .then((attachment) => update(draft.key, { status: "done", progress: 1, attachment }))
        .catch(() => {
          if (!controller.signal.aborted) update(draft.key, { status: "failed" });
        })
        .finally(() => controllers.current.delete(draft.key));
    },
    [client, update],
  );

  const pick = useCallback(
    async (source: PickSource) => {
      const room = MAX_ATTACHMENTS_PER_MESSAGE - drafts.length;
      if (room <= 0) {
        setNotice(describeProblem(strings, { kind: "tooMany" }));
        return;
      }
      let result;
      try {
        if (!picker) return;
        result = await picker.pick(source, Math.min(room, MAX_ATTACHMENTS_PER_MESSAGE));
      } catch {
        setNotice(strings.uploadFailed);
        return;
      }
      if (result.kind === "denied") setNotice(strings.cameraAccessDenied);
      if (result.kind !== "picked") return;
      const { accepted, problems } = validatePicked(result.files, drafts.length);
      if (problems[0]) setNotice(describeProblem(strings, problems[0]));
      const added = accepted.map<DraftAttachment>((file) => ({
        key: `a${nextKey++}`,
        file,
        progress: 0,
        status: "uploading",
        attachment: null,
      }));
      setDrafts((list) => [...list, ...added]);
      added.forEach(upload);
    },
    [drafts.length, picker, strings, upload],
  );

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    setDrafts((list) => list.filter((d) => d.key !== key));
  }, []);

  const retry = useCallback(
    (key: string) => {
      const draft = drafts.find((d) => d.key === key);
      if (!draft || draft.status !== "failed") return;
      update(key, { status: "uploading", progress: 0 });
      upload(draft);
    },
    [drafts, update, upload],
  );

  /** Clears the tray after a send; uploads already finished are attached to that message. */
  const clear = useCallback(() => setDrafts([]), []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Leaving the screen cancels uploads nobody will send.
  useEffect(() => {
    const running = controllers.current;
    return () => running.forEach((controller) => controller.abort());
  }, []);

  const uploaded = drafts.flatMap((d) => (d.attachment ? [d.attachment] : []));
  const busy = drafts.some((d) => d.status === "uploading");
  return { drafts, uploaded, busy, notice, pick, remove, retry, clear };
}
