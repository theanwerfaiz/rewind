import { afterAll, beforeAll, describe, expect, it } from "vitest";

import db from "@/lib/db";
import { getEventById, getEventStats, getEvents } from "@/lib/events";

// Tests run on an empty temporary database, so this file stores the event
// it reads instead of relying on whatever other files captured.
const EVENT_ID = `evt_service_test_${Date.now()}`;

beforeAll(() => {
  db.prepare(
    `INSERT INTO events (id, timestamp, type, title, status, duration, created_at)
     VALUES (?, ?, 'http.request', 'GET /api/service-test', 'success', '12ms', ?)`,
  ).run(EVENT_ID, new Date(Date.now() + 60_000).toISOString(), new Date().toISOString());
});

afterAll(() => {
  db.prepare(`DELETE FROM events WHERE id = ?`).run(EVENT_ID);
});

describe("event service", () => {
  it("returns captured events", () => {
    const events = getEvents();

    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });

  it("returns an existing event by id", () => {
    const event = getEventById(EVENT_ID);

    expect(event).not.toBeNull();
    expect(event?.id).toBe(EVENT_ID);
    expect(event?.title).toBe("GET /api/service-test");
  });

  it("returns null for an unknown event id", () => {
    const event = getEventById("evt_does_not_exist");

    expect(event).toBeNull();
  });

  it("returns event statistics", () => {
    const stats = getEventStats();

    expect(stats.total).toBeGreaterThan(0);
    expect(stats.errors).toBeGreaterThanOrEqual(0);
    expect(stats.webhooks).toBeGreaterThanOrEqual(0);

    if (stats.averageLatency !== null) {
      expect(Number.isFinite(stats.averageLatency)).toBe(true);

      expect(stats.averageLatency).toBeGreaterThanOrEqual(0);
    }
  });
});
