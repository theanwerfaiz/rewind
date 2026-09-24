/**
 * Request body limits. The proxy rejects bodies whose Content-Length is too
 * large with 413 before a route runs; readJsonBody is the backstop for
 * bodies sent without a length (chunked), and stops reading at the limit
 * instead of buffering whatever arrives.
 */

export const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024;

/** Capsules carry a whole execution, so their import allows more. */
export const MAX_CAPSULE_BODY_BYTES = 12 * 1024 * 1024;

export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body is larger than ${maxBytes} bytes.`);
    this.name = "BodyTooLargeError";
  }
}

/** Largest body accepted for a path; used by the proxy. */
export function maxBodyBytesFor(pathname: string) {
  return pathname === "/api/capsules" || pathname === "/api/verifications"
    ? MAX_CAPSULE_BODY_BYTES
    : DEFAULT_MAX_BODY_BYTES;
}

export async function readTextBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<string> {
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new BodyTooLargeError(maxBytes);
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();

  const chunks: Uint8Array[] = [];

  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError(maxBytes);
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(size);

  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

/** Like request.json(), with a size limit. Rejects on invalid JSON. */
export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  return JSON.parse(await readTextBody(request, maxBytes));
}

/**
 * Reads a body that must be a JSON object. Returns null for invalid JSON
 * or any other JSON value, so routes can answer 400 instead of failing.
 * Oversized bodies still throw BodyTooLargeError.
 */
export async function readJsonObject(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<Record<string, unknown> | null> {
  let value: unknown;

  try {
    value = await readJsonBody(request, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      throw error;
    }

    return null;
  }

  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
