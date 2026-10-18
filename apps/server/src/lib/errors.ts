import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = "bad_request") => new ApiError(400, code, message);
export const unauthorized = (message = "Sign in required") => new ApiError(401, "unauthorized", message);
export const forbidden = (message = "Not allowed", code = "forbidden") => new ApiError(403, code, message);
export const notFound = (message = "Not found") => new ApiError(404, "not_found", message);
export const conflict = (message: string) => new ApiError(409, "conflict", message);
export const tooManyRequests = () => new ApiError(429, "rate_limited", "Too many requests, slow down");
