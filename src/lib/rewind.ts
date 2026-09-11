import type { EventStatus, EventType, RewindEvent } from "./mock-events";

export type CaptureEventInput = {
  type: EventType;
  title: string;
  status?: EventStatus;
  duration?: string | null;
  source?: string | null;

  traceId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  userId?: string | null;

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

function createEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function capture(
  event: CaptureEventInput,
  options: CaptureOptions = {},
): Promise<RewindEvent> {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: createEventId(),
      ...event,
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
