import { Hono } from "hono";
import { isInlineImage } from "yunidesk";
import type { AppEnv } from "../app-env";
import type { AttachmentRow } from "../db/rows";
import { notFound } from "../lib/errors";
import { verifyFileSignature } from "../lib/tokens";

export const fileRoutes = new Hono<AppEnv>();

// Hardening for anything we serve that a user uploaded.
const UPLOAD_HEADERS = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  "cross-origin-resource-policy": "same-site",
};

fileRoutes.get("/files/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await verifyFileSignature(c.env.SESSION_SECRET, id, c.req.query("exp"), c.req.query("sig"));
  if (!ok) throw notFound("This link has expired");
  const row = await c.env.DB.prepare("SELECT * FROM attachments WHERE id = ?").bind(id).first<AttachmentRow>();
  if (!row) throw notFound();
  const object = await c.env.FILES.get(row.r2_key);
  if (!object) throw notFound();
  const disposition = isInlineImage(row.content_type) ? "inline" : "attachment";
  return new Response(object.body, {
    headers: {
      ...UPLOAD_HEADERS,
      "content-type": row.content_type,
      "content-length": String(row.size),
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      "cache-control": "private, max-age=3600",
      etag: object.httpEtag,
    },
  });
});

/** Team avatars are public (they appear in the widget). */
fileRoutes.get("/avatars/:key", async (c) => {
  const key = c.req.param("key");
  if (!/^[\w-]+$/.test(key)) throw notFound();
  const object = await c.env.FILES.get(`avatars/${key}`);
  if (!object) throw notFound();
  return new Response(object.body, {
    headers: {
      ...UPLOAD_HEADERS,
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      etag: object.httpEtag,
    },
  });
});
