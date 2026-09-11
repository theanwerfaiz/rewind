# Rewind

> Capture what happened. Reproduce it. Fix it. Prevent it.

Rewind is an open-source engineering flight recorder for modern software.

It captures software events and lets developers inspect, understand, reproduce, replay, compare, and turn real failures into repeatable regression tests.

---

## The Problem

When something breaks in production, developers usually have to reconstruct what happened from incomplete information:

- logs
- traces
- screenshots
- error messages
- request IDs
- monitoring dashboards
- customer reports
- webhook logs
- manually reproduced requests

The problem is not always discovering that something failed.

The harder question is:

> **Can I reproduce exactly what happened?**

Rewind is built around that question.

Instead of only recording that an event happened, Rewind keeps the captured event as something you can inspect and replay.

---

## The Rewind Workflow

```text
Capture
   ↓
Understand
   ↓
Reproduce
   ↓
Replay
   ↓
Compare
   ↓
Generate a Test
   ↓
Prevent Regression
```

A real production failure can become a repeatable regression test.

```text
Real failure
     ↓
Captured event
     ↓
Inspect request + response
     ↓
Replay locally
     ↓
Modify payload
     ↓
Compare original vs replay
     ↓
Generate regression test
     ↓
Run test
     ↓
Prevent regression
```

---

## What Rewind Does

Rewind currently provides:

- HTTP request/response capture
- Automatic HTTP capture for Next.js route handlers
- Webhook capture
- Event storage in SQLite
- Event inspection
- Event timeline
- Event search
- Event filtering
- Request and response metadata
- Local HTTP replay
- Editable replay payloads
- Replay history
- Replay detail pages
- Original vs replay comparison
- Field-level payload diffs
- Response comparison
- Playwright test generation
- Vitest test generation
- Generated Vitest test execution
- Replay result reporting
- Docker support
- Persistent SQLite storage

---

## Why Rewind?

Traditional observability tools answer questions such as:

> What failed?

> When did it fail?

> Which service was involved?

Rewind focuses on the next step:

> **What exactly happened, and can I reproduce it?**

Rewind is intentionally narrower than a full observability platform.

It is an engineering tool for turning captured behavior into something developers can work with.

---

# Quickstart

## Requirements

### Docker

Recommended for running the production-style application.

- Docker
- Docker Compose

### Local development

- Node.js 22+
- npm

---

## Run with Docker

Clone the repository:

```bash
git clone <repository-url>
cd rewind
```

Build and start Rewind:

```bash
docker compose up --build
```

Open Rewind:

```text
http://localhost:3000
```

The application runs as a production Next.js standalone server inside Docker.

SQLite is stored in a Docker named volume.

This means captured events survive container restarts.

---

## Run Docker in the Background

```bash
docker compose up -d --build
```

Check the container:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f rewind
```

Stop Rewind:

```bash
docker compose down
```

---

## Verify Docker

Check the API:

```bash
curl http://localhost:3000/api/events
```

Check replay history:

```bash
curl http://localhost:3000/api/replays
```

Check the SQLite database:

```bash
docker compose exec rewind ls -la /app/data
```

The database should contain:

```text
rewind.db
rewind.db-shm
rewind.db-wal
```

---

# Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Seed Demo Events

To populate the local SQLite database with example events:

```bash
npm run seed
```

Then open:

```text
http://localhost:3000
```

The dashboard will contain example events that can be inspected and explored.

---

# Capture Events

Rewind exposes an event capture API.

## Create an Event

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "http.request",
    "title": "Checkout request",
    "status": "success",
    "duration": "120ms",
    "source": "example",
    "metadata": {
      "method": "POST",
      "path": "/api/checkout"
    },
    "payload": {
      "orderId": "order_123",
      "amount": 4999
    }
  }'
```

The captured event is persisted in SQLite and becomes available in the dashboard.

---

## Event Types

The current event model supports:

```text
webhook.received
http.request
error
database.query
agent.action
command
deployment
config.change
```

The current replay workflow is focused on HTTP requests and webhook events.

---

# HTTP Capture

Rewind provides automatic HTTP capture for Next.js route handlers.

Import the wrapper:

```ts
import { withRewindCapture } from "@/lib/rewind-http";
```

Wrap a route handler:

```ts
import { withRewindCapture } from "@/lib/rewind-http";

export const POST = withRewindCapture(async (request) => {
  const body = await request.json();

  return Response.json({
    received: true,
    body,
  });
});
```

Rewind automatically captures the request and response.

---

## HTTP Capture Includes

Captured HTTP events can contain:

- HTTP method
- request path
- query string
- request headers
- request payload
- response status
- response status text
- response headers
- response body
- request duration
- request ID
- environment
- errors

Example captured metadata:

```json
{
  "environment": "development",
  "method": "POST",
  "path": "/api/checkout?source=web",
  "headers": {
    "content-type": "application/json"
  },
  "response": {
    "status": 200,
    "statusText": "OK",
    "headers": {
      "content-type": "application/json"
    },
    "body": {
      "success": true
    }
  }
}
```

---

# Webhook Capture

Rewind provides a dedicated webhook capture endpoint:

```text
POST /api/webhooks/capture
```

Example:

```bash
curl -X POST http://localhost:3000/api/webhooks/capture \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Event: payment.completed" \
  -d '{
    "id": "evt_demo_123",
    "amount": 4999,
    "currency": "USD"
  }'
```

The webhook becomes a captured event in Rewind.

---

## Webhook Features

Webhook capture preserves:

- request payload
- HTTP method
- request path
- query string
- request headers
- request ID
- environment metadata

Sensitive headers are redacted before storage.

---

# Security and Header Redaction

Rewind is designed as a local-first engineering tool.

Sensitive request headers are automatically redacted.

The following headers are currently protected:

```text
authorization
cookie
set-cookie
x-api-key
x-auth-token
```

Captured values for these headers are stored as:

```text
[REDACTED]
```

---

## Replay Header Protection

Replay requests also remove infrastructure-specific headers.

These include:

```text
host
content-length
connection
keep-alive
transfer-encoding
upgrade
x-forwarded-for
x-forwarded-host
x-forwarded-port
x-forwarded-proto
```

Rewind also prevents captured replay marker headers from overriding the headers added by the replay system.

---

# Event Dashboard

The main dashboard provides an overview of captured activity.

The dashboard includes:

- total events
- errors
- webhooks
- average HTTP latency
- recent events
- event search
- event filtering

---

# Search and Filtering

The Events dashboard supports searching captured events.

Search can match fields including:

- event title
- event type
- source
- request ID
- trace ID
- session ID
- user ID

Events can also be filtered by event type.

This makes it possible to quickly narrow a large event history down to the request or workflow being investigated.

---

# Event Details

Every captured event has a dedicated detail page.

Event details can include:

- event type
- timestamp
- status
- duration
- source
- request context
- trace ID
- request ID
- session ID
- user ID
- request metadata
- response metadata
- payload
- raw metadata

For HTTP events, the request and response can be inspected separately.

---

# Timeline

The Timeline view presents events chronologically.

Related events can be grouped using request IDs.

This makes it easier to understand what happened during a single request or workflow.

Example:

```text
10:42:01  HTTP request
    ↓
10:42:01  Database query
    ↓
10:42:02  Webhook received
    ↓
10:42:02  Error
```

Each event can be opened directly from the timeline.

---

# Replay

Replay is one of the core Rewind workflows.

For supported HTTP and webhook events, Rewind can send the captured request back to the local application.

The replay process is:

```text
Captured Event
      ↓
Load request
      ↓
Sanitize headers
      ↓
Apply optional payload changes
      ↓
Send to local application
      ↓
Capture response
      ↓
Persist replay
      ↓
Compare result
```

---

## Supported Replay Methods

The replay engine currently supports:

```text
GET
POST
PUT
PATCH
DELETE
HEAD
```

---

## Local Replay Protection

By default, replay targets are restricted to localhost.

The default replay base URL is:

```text
http://localhost:3000
```

It can be configured with:

```bash
REWIND_REPLAY_BASE_URL=http://localhost:3000
```

Replay requests include Rewind markers:

```text
X-Rewind-Replay
X-Rewind-Original-Event
```

This allows an application to identify replay traffic.

---

# Editable Replay Payloads

Rewind allows the captured payload to be modified before replay.

For example, a captured request:

```json
{
  "amount": 100,
  "currency": "USD"
}
```

can be replayed as:

```json
{
  "amount": 500,
  "currency": "USD"
}
```

This allows developers to test different scenarios without changing the original captured event.

---

# Replay History

Successful replay responses are stored in SQLite.

Replay history is available at:

```text
http://localhost:3000/replays
```

Each replay records:

- replay ID
- original event ID
- timestamp
- HTTP method
- target URL
- status
- duration
- payload used
- response body
- response headers
- creation time

---

# Replay Details

Individual replay results can be inspected.

A replay detail page provides:

- replay information
- target URL
- HTTP method
- status
- duration
- request payload
- response headers
- response body
- original event
- original vs replay comparison

---

# Replay Comparison

Rewind compares the original captured request with the actual replay request.

This makes changes visible.

Example:

```text
Original

{
  "captured": true
}
```

vs.

```text
Replay

{
  "captured": false
}
```

Rewind reports the number of differences and provides field-level changes.

---

# Field-Level Diffs

Rewind can identify changes inside nested JSON structures.

Example:

```text
payload.user.name
payload.order.amount
payload.items[0].price
```

Changes are classified as:

```text
added
removed
changed
```

Example:

```text
payload.amount

Original: 100
Replay:   500

Type: changed
```

---

# Response Comparison

Rewind also compares the original response with the replay response.

The comparison can identify:

- response status changes
- response body changes
- nested field changes
- added response fields
- removed response fields
- changed response fields

This helps determine whether a local replay actually reproduces the original behavior.

---

# Generate Tests

Captured HTTP events can be converted into regression tests.

Supported frameworks:

- Playwright
- Vitest

The generated test is based on the captured request.

---

## Playwright

Rewind generates a Playwright request test containing:

- request method
- request path
- payload when applicable
- response success assertion

Example:

```ts
import { test, expect } from "@playwright/test";

test("reproduces checkout request", async ({ request }) => {
  const response = await request.post("/api/checkout", {
    data: {
      orderId: "order_123",
      amount: 4999,
    },
  });

  expect(response.ok()).toBeTruthy();
});
```

---

## Vitest

Rewind can generate an equivalent Vitest test:

```ts
import { describe, expect, it } from "vitest";

describe("Rewind regression", () => {
  it("reproduces checkout request", async () => {
    const response = await fetch("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        orderId: "order_123",
        amount: 4999,
      }),
    });

    expect(response.ok).toBe(true);
  });
});
```

---

# Execute Generated Tests

Vitest tests can be executed directly from the Rewind interface.

The test runner reports:

- PASS / FAIL
- exit code
- execution duration
- stdout
- stderr
- execution errors

A successful result looks like:

```text
Test passed
Exit code 0
```

This closes the loop between:

```text
Captured failure
      ↓
Replay
      ↓
Fix
      ↓
Generate test
      ↓
Run test
      ↓
Regression protected
```

---

# Search, Timeline, Replay, and Tests

The core product experience can be summarized as:

```text
┌─────────────────────────────────────────────┐
│                 CAPTURE                     │
│                                             │
│       HTTP requests + webhooks              │
└──────────────────────┬──────────────────────┘
                       ↓
┌─────────────────────────────────────────────┐
│                UNDERSTAND                   │
│                                             │
│       Search + Timeline + Details           │
└──────────────────────┬──────────────────────┘
                       ↓
┌─────────────────────────────────────────────┐
│                 REPRODUCE                   │
│                                             │
│       Replay the captured request           │
└──────────────────────┬──────────────────────┘
                       ↓
┌─────────────────────────────────────────────┐
│                  COMPARE                    │
│                                             │
│     Original vs Replay + Field-level Diff  │
└──────────────────────┬──────────────────────┘
                       ↓
┌─────────────────────────────────────────────┐
│              GENERATE TEST                  │
│                                             │
│             Playwright / Vitest             │
└──────────────────────┬──────────────────────┘
                       ↓
┌─────────────────────────────────────────────┐
│                PREVENT                      │
│                                             │
│          Execute regression test            │
└─────────────────────────────────────────────┘
```

---

# API

Current API endpoints:

```text
GET  /api/events
POST /api/events

GET  /api/events/:id

POST /api/replay

GET  /api/replays

POST /api/webhooks/capture

POST /api/test-generator

POST /api/test-runner

POST /api/test-capture
```

---

# Events API

## List Events

```http
GET /api/events
```

Optional query parameters include:

```text
q
type
limit
```

Example:

```bash
curl "http://localhost:3000/api/events?limit=20"
```

Search:

```bash
curl "http://localhost:3000/api/events?q=checkout"
```

Filter:

```bash
curl "http://localhost:3000/api/events?type=http.request"
```

---

## Get an Event

```http
GET /api/events/:id
```

Example:

```bash
curl http://localhost:3000/api/events/<event-id>
```

---

# Replay API

Replay an event through:

```http
POST /api/replay
```

The replay request can contain:

```json
{
  "eventId": "evt_example",
  "payload": {
    "amount": 500
  }
}
```

The payload is optional.

When supplied, it replaces the captured payload for the replay.

---

# Replays API

List replays:

```http
GET /api/replays
```

Filter by original event:

```http
GET /api/replays?eventId=<event-id>
```

Limit results:

```http
GET /api/replays?limit=20
```

---

# Test Generator API

Generate a test:

```http
POST /api/test-generator
```

Example:

```json
{
  "eventId": "evt_example",
  "framework": "vitest"
}
```

Supported frameworks:

```text
playwright
vitest
```

---

# Test Runner API

Execute a generated test through:

```http
POST /api/test-runner
```

The runner currently supports generated Vitest tests.

The API returns information including:

```text
success
exitCode
stdout
stderr
duration
```

---

# Configuration

## Capture Endpoint

The Rewind SDK defaults to:

```text
http://localhost:3000/api/events
```

It can be configured with:

```bash
REWIND_CAPTURE_URL=http://localhost:3000/api/events
```

---

## Replay Base URL

The replay engine defaults to:

```text
http://localhost:3000
```

Configure it with:

```bash
REWIND_REPLAY_BASE_URL=http://localhost:3000
```

---

# Docker Configuration

The included Docker Compose configuration provides:

```text
┌──────────────────────────────┐
│          Docker              │
│                              │
│  ┌────────────────────────┐  │
│  │      Rewind App        │  │
│  │                        │  │
│  │  Next.js + SQLite      │  │
│  └───────────┬────────────┘  │
│              │               │
│              ▼               │
│  ┌────────────────────────┐  │
│  │    Named Volume        │  │
│  │                        │  │
│  │      /app/data         │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

The database is persisted independently of the container lifecycle.

---

# Project Structure

```text
rewind/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── events/
│   │   │   ├── replay/
│   │   │   ├── replays/
│   │   │   ├── test-capture/
│   │   │   ├── test-generator/
│   │   │   ├── test-runner/
│   │   │   └── webhooks/
│   │   ├── events/
│   │   ├── replays/
│   │   └── timeline/
│   │
│   ├── components/
│   │   ├── dashboard/
│   │   ├── events/
│   │   └── icons/
│   │
│   └── lib/
│       ├── db.ts
│       ├── event-metadata.ts
│       ├── events.ts
│       ├── mock-events.ts
│       ├── replay-diff.ts
│       ├── replays.ts
│       ├── rewind-http.ts
│       ├── rewind.ts
│       └── test-generator.ts
│
├── scripts/
│   └── seed.ts
│
├── tests/
│   ├── events.test.ts
│   ├── replay.test.ts
│   ├── replay-diff.test.ts
│   ├── rewind-http.test.ts
│   ├── rewind.test.ts
│   ├── test-generator.test.ts
│   ├── test-runner.test.ts
│   ├── test-runner-api.test.ts
│   └── webhook-capture.test.ts
│
├── Dockerfile
├── docker-compose.yml
├── next.config.ts
├── package.json
├── package-lock.json
└── README.md
```

---

# Architecture

```text
                         APPLICATION
                              │
                              ▼
                    ┌──────────────────┐
                    │   Capture Layer  │
                    │                  │
                    │ HTTP / Webhooks  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │      SQLite      │
                    │                  │
                    │ events / replays │
                    └────────┬─────────┘
                             │
                 ┌───────────┼───────────┐
                 │           │           │
                 ▼           ▼           ▼
              Inspect     Timeline     Search
                 │
                 ▼
              Replay
                 │
                 ▼
          Local Application
                 │
                 ▼
              Compare
                 │
                 ▼
           Generate Test
                 │
                 ▼
            Run Test
```

---

# Data Model

Rewind currently stores two primary types of records:

```text
Event
  │
  └────── 1:N ────── Replay
```

One captured event can have multiple replay attempts.

---

## Events Table

The event store contains fields such as:

```text
id
timestamp
type
title
status
duration
source
trace_id
request_id
session_id
user_id
metadata
payload
created_at
```

Indexes are maintained for commonly queried fields such as:

```text
timestamp
type
request_id
user_id
```

---

## Replays Table

The replay store contains:

```text
id
event_id
timestamp
method
url
status
duration
payload
response_body
response_headers
created_at
```

Each replay references its original event.

---

# Testing

Rewind includes automated tests covering:

- event storage
- event retrieval
- event statistics
- event capture
- HTTP capture
- webhook capture
- request replay
- replay payload modification
- replay history
- replay comparison
- field-level diffs
- response comparison
- test generation
- test execution
- test runner API

Run the complete test suite:

```bash
npm test
```

Build the production application:

```bash
npm run build
```

---

# Development Commands

| Command                     | Purpose                   |
| --------------------------- | ------------------------- |
| `npm run dev`               | Start development server  |
| `npm run build`             | Create production build   |
| `npm start`                 | Start production server   |
| `npm test`                  | Run automated tests       |
| `npm run seed`              | Seed demo events          |
| `docker compose up --build` | Build and run with Docker |
| `docker compose down`       | Stop Docker deployment    |

---

# Security Considerations

Rewind is designed as a local-first engineering tool.

The current MVP provides:

- sensitive header redaction
- replay header sanitization
- localhost replay restrictions
- replay identification headers
- SQLite local persistence

However, Rewind should not currently be treated as a production-hardened public service.

If deploying Rewind in a shared or publicly accessible environment, additional controls should be added, including appropriate:

- authentication
- authorization
- network restrictions
- encryption
- secret management
- retention policies
- audit logging

Captured request payloads may contain application data. Users are responsible for ensuring their capture configuration complies with their organization's security and privacy requirements.

---

# Non-Goals

Rewind is intentionally not trying to become everything.

The current MVP is not intended to replace:

- Datadog
- Sentry
- full observability platforms
- distributed tracing platforms
- Kubernetes observability systems
- enterprise RBAC
- enterprise billing
- hosted SaaS infrastructure

Rewind's focus is narrower:

> **Capture what happened and make it reproducible.**

---

# Roadmap

Potential future work includes:

## Observability

- OpenTelemetry integration
- trace correlation
- broader event sources
- richer request context

## Storage

- PostgreSQL support
- larger-scale storage
- retention policies
- configurable persistence backends

## Integrations

- Redis
- Kafka
- GitHub
- CI/CD systems
- additional webhook providers
- additional application frameworks

## Testing

- additional test frameworks
- richer generated assertions
- automated regression suites
- CI integration

## Replay

- more replay targets
- replay collections
- replay workflows
- batch replay
- advanced comparison

## AI

- AI-assisted event investigation
- natural-language event search
- failure explanation
- suggested fixes
- automated regression test improvements

## Collaboration

- team workspaces
- shared events
- permissions
- comments
- incident workflows

These capabilities are intentionally outside the current MVP.

---

# Current MVP Scope

The current MVP focuses on the following core loop:

```text
┌───────────────┐
│ Capture       │
└───────┬───────┘
        ↓
┌───────────────┐
│ Understand    │
└───────┬───────┘
        ↓
┌───────────────┐
│ Reproduce     │
└───────┬───────┘
        ↓
┌───────────────┐
│ Replay        │
└───────┬───────┘
        ↓
┌───────────────┐
│ Compare       │
└───────┬───────┘
        ↓
┌───────────────┐
│ Generate Test │
└───────┬───────┘
        ↓
┌───────────────┐
│ Prevent       │
└───────────────┘
```

The goal is not to collect every possible engineering signal.

The goal is to preserve enough of what happened to make the behavior reproducible.

---

# Contributing

Rewind is intended to be an open-source engineering project.

Contributions are welcome.

Before submitting a change, run:

```bash
npm test
npm run build
```

For Docker-related changes, also run:

```bash
docker compose build
docker compose up -d
```

Then verify:

```bash
curl http://localhost:3000/api/events
```

---

# License

Rewind is open source.

License details will be added before the first public release.

---

# Status

Rewind is currently an MVP.

The core capture → inspect → replay → compare → test workflow is implemented.

The project is intentionally being kept focused before expanding into larger observability, AI, integration, and collaboration features.

---

## The Vision

Software systems produce enormous amounts of information.

But when something breaks, developers often still have to reconstruct the story manually.

Rewind aims to make that story replayable.

```text
Something happened.
        ↓
Rewind captured it.
        ↓
You understand it.
        ↓
You reproduce it.
        ↓
You fix it.
        ↓
You replay it.
        ↓
You generate a test.
        ↓
It does not break the same way again.
```

> **Rewind: Capture what happened. Reproduce it. Fix it. Prevent it.**
