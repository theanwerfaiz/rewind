import { describe, expect, it } from "vitest";

import { getEventById, getEventStats, getEvents } from "@/lib/events";

describe("event service", () => {
  it("returns captured events", () => {
    const events = getEvents();

    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });

  it("returns an existing event by id", () => {
    const events = getEvents();

    const firstEvent = events[0];

    expect(firstEvent).toBeDefined();

    if (!firstEvent) {
      return;
    }

    const event = getEventById(firstEvent.id);

    expect(event).not.toBeNull();
    expect(event?.id).toBe(firstEvent.id);
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
