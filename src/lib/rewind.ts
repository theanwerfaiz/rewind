import { createEventId, getExecutionContext } from "./execution-context";
import type { EventStatus, EventType, RewindEvent } from "./mock-events";

export type CaptureEventInput = {
  id?: string;
  timestamp?: string;
  type: EventType;
  title: string;
  status?: EventStatus;
  duration?: string | null;
  source?: string | null;

  traceId?: string | null;
  spanId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  userId?: string | null;

  executionId?: string | null;
  parentEventId?: string | null;

  metadata?: Record<string, unknown>;
  payload?: unknown;
};

type CaptureOptions = {
  endpoint?: string;
};

type CaptureResponse = {
  event: RewindEvent;
};

const DEFAULT_ENDPOINT =
  process.env.REWIND_CAPTURE_URL ?? "http://localhost:3000/api/events";

/** Origin of the Rewind server that events are captured to. */
export function getRewindOrigin() {
  return new URL(DEFAULT_ENDPOINT).origin;
}

/**
 * Headers that authenticate calls to Rewind when the server requires an
 * access token (REWIND_ACCESS_TOKEN, shared with the capturing app).
 */
export function rewindAuthHeaders(): Record<string, string> {
  const token = process.env.REWIND_ACCESS_TOKEN?.trim();

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function capture(
  event: CaptureEventInput,
  options: CaptureOptions = {},
): Promise<RewindEvent> {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;

  // Events captured inside an execution join it as children of the event
  // that opened the current execution scope. Pass null to opt out.
  const context = getExecutionContext();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...rewindAuthHeaders(),
    },
    body: JSON.stringify({
      ...event,
      id: event.id ?? createEventId(),
      executionId:
        event.executionId !== undefined
          ? event.executionId
          : context?.executionId,
      parentEventId:
        event.parentEventId !== undefined
          ? event.parentEventId
          : context?.eventId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(`Rewind capture failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as CaptureResponse;

  if (!data.event) {
    throw new Error(
      "Rewind capture failed: API response did not contain an event.",
    );
  }

  return data.event;
}

export const rewind = {
  capture,
};
