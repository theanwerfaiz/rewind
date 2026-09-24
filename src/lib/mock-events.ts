export type EventType =
  | "webhook.received"
  | "http.request"
  | "error"
  | "database.query"
  | "agent.action"
  | "command"
  | "deployment"
  | "config.change";

export type EventStatus = "success" | "error" | "neutral";

export type RewindEvent = {
  id: string;
  timestamp: string;
  type: EventType;
  title: string;
  status: EventStatus;
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

  createdAt?: string;
};
