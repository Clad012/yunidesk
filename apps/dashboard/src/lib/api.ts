import type { ApiErrorBody } from "yunidesk";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;

/** Called on any 401 from the team API (outside /auth), so the app can send the user to /login. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function toError(response: Response, path: string): Promise<ApiError> {
  let code = "http_error";
  let message = response.statusText || "Request failed";
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.error) ({ code, message } = body.error);
  } catch {
    // not JSON
  }
  if (response.status === 401 && path.startsWith("/api/agent/") && !path.startsWith("/api/agent/auth/")) {
    onUnauthorized?.();
  }
  return new ApiError(response.status, code, message);
}

type Body = Record<string, unknown> | unknown[] | FormData;

export async function api<T>(path: string, init: { method?: string; body?: Body; signal?: AbortSignal } = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const response = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    credentials: "same-origin",
    headers: init.body && !isForm ? { "content-type": "application/json" } : undefined,
    body: init.body ? (isForm ? (init.body as FormData) : JSON.stringify(init.body)) : undefined,
    signal: init.signal,
  });
  if (!response.ok) throw await toError(response, path);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Multipart upload with progress (fetch has no upload progress events). */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = xhr.response as (T & Partial<ApiErrorBody>) | null;
      if (xhr.status >= 200 && xhr.status < 300 && body) return resolve(body);
      if (xhr.status === 401) onUnauthorized?.();
      reject(new ApiError(xhr.status, body?.error?.code ?? "upload_failed", body?.error?.message ?? "Upload failed"));
    };
    xhr.onerror = () => reject(new ApiError(0, "network", "Network error"));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "Upload cancelled"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message || fallback : fallback;
}
