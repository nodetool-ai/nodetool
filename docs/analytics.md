# Product Analytics

NodeTool's product analytics are opt-in, anonymous, and limited to a fixed list
of typed events. This page describes what is collected, how each client asks
for consent, and how events travel and are stored. The code lives in
[`packages/analytics`](../packages/analytics/) (`@nodetool-ai/analytics`).

## Rules

1. Nothing is sent until the person grants consent on that client.
2. Events carry no account, organization, project, workflow, job or asset ID,
   and no IP address, hostname, port, path, URL or user agent.
3. Every event name and property is declared in
   [`schema/events.ts`](../packages/analytics/src/schema/events.ts). Values are
   enums or buckets. There is no `track(name, props)` with free-form data.
4. The client validates every event before it is queued, and the server
   validates it again before it is relayed or stored.
5. Analytics never changes product behavior. Every call swallows its own errors.

Session replay, DOM autocapture, keystroke tracking, prompt or content capture,
command-line capture, account-linked tracking and cross-client tracking are out
of scope. Do not add them.

## Clients

The client type is an explicit enum set by the code that creates the client. It
is never derived from a user agent.

| Client | Set by | Consent and ID stored in |
|---|---|---|
| `cloud_web` | web app when `/api/config` reports `cloudProfile` | browser `localStorage`, key prefix `nodetool.analytics.cloud_web` |
| `local_web` | web app outside Electron without the cloud profile | browser `localStorage`, key prefix `nodetool.analytics.local_web` |
| `local_desktop` | web app inside Electron (`window.api`) | the desktop app's own `localStorage`, key prefix `nodetool.analytics.local_desktop` |
| `npm_cli` | the `nodetool` CLI | `~/.nodetool/telemetry.json`, mode 0600 |
| `cloud_backend` | the API server | nothing stored; enabled by the operator |

Consent never moves between clients. Granting it in the Cloud web app does not
enable the desktop app, the local web UI or the CLI, and the reverse is also
true. Signing in or out does not read or change analytics state, so the
anonymous ID is the same before and after sign-in and is never merged with an
account.

## Consent

Each client stores three separate decisions: `productAnalytics`,
`diagnostics` and `crashReports`. Each is `unset`, `granted` or `denied`. Only
product analytics has a sender. Diagnostics and crash reports have no
implementation and stay off.

- Web and desktop: Settings → Privacy has the switch, the list of what is and
  is not collected, and the recent events exactly as serialized. After the
  first successful workflow run, a small non-modal card asks once. Answering or
  ignoring it records that it was asked.
- CLI: `nodetool telemetry enable|disable|status|inspect`. The CLI never
  prompts. Installing, upgrading, `npx`, CI and importing a package never
  enable it or reset the decision.
- `NODETOOL_TELEMETRY=0` (or `false`, `off`, `no`) and `DO_NOT_TRACK=1` turn
  the CLI and backend off regardless of stored consent. No environment variable
  turns analytics on.

Revoking consent deletes the anonymous ID, the unsent queue and the session
counters right away.

## Identity

- Anonymous ID: a random UUID created after consent. It rotates every 30 days
  and can be reset from Settings → Privacy.
- Session ID: a random UUID per app launch or CLI invocation.
- `cloud_backend` events carry neither.

Neither ID is derived from an account, a machine, a path or a hostname.

## Events

Every event has this envelope. `timestamp` is truncated to the hour.

```json
{
  "schemaVersion": 1,
  "event": "workflow_run_failed",
  "clientType": "local_desktop",
  "anonymousId": "3b241101-e2bb-4255-8caf-4136c566a962",
  "sessionId": "6fa459ea-ee8a-4ca4-894e-db77e160355e",
  "timestamp": "2026-10-17T21:00:00.000Z",
  "appVersion": "0.8.4",
  "platform": "macos",
  "properties": {
    "executionMode": "local",
    "nodeCountBucket": "6-20",
    "durationBucket": "10-30s",
    "errorCategory": "provider"
  }
}
```

| Event | Clients | Properties |
|---|---|---|
| `app_started` | web, desktop | none |
| `cli_started` | CLI | `commandCategory` |
| `workflow_created` | web, desktop | none |
| `workflow_run` | web, desktop, CLI | `executionMode`, `nodeCountBucket` |
| `workflow_run_succeeded` | web, desktop, CLI | adds `durationBucket` |
| `workflow_run_failed` | web, desktop, CLI | adds `durationBucket`, `errorCategory` |
| `session_summary` | web, desktop, CLI | `workflowRuns`, `workflowsCreated` as count buckets |
| `execution_started` | backend | `executionMode`, `feature` |
| `execution_completed` | backend | adds `durationBucket` |
| `execution_failed` | backend | adds `durationBucket`, `errorCategory` |

`errorCategory` is computed on the client from the error message, which never
leaves the process. The forbidden-field list in
[`forbidden-fields.ts`](../packages/analytics/src/privacy/forbidden-fields.ts)
rejects any event that contains an identity, credential or content field at
any depth.

To add an event, add it to `ANALYTICS_EVENTS` with enum or bucket properties,
bump nothing else unless the envelope changes, and add a test. Changing the
envelope requires a new `ANALYTICS_SCHEMA_VERSION`.

## Flow

```
web / desktop  ──POST same origin──▶  /api/analytics/v1/events  ──relay──▶  analytics endpoint
CLI  ───────────────────POST───────────────────────────────────────────────▶  analytics endpoint
backend ── in process ──▶ relay or store
```

- Browser clients post to their own server, so the browser contacts no third
  party. Requests send no cookies and no referrer.
- `POST /api/analytics/v1/events` is exempt from auth, so it never resolves a
  user. It reads only the body, validates it, and then acts by mode:
  - relay (default): forwards the validated body to
    `NODETOOL_ANALYTICS_ENDPOINT` (default
    `https://analytics.nodetool.ai/api/analytics/v1/events`). No browser header
    travels on.
  - ingest (`NODETOOL_ANALYTICS_INGEST=1`): stores the batch.
  - off (`NODETOOL_ANALYTICS_RELAY=0`): accepts and discards.
- Clients batch up to 50 events, retry with backoff from 1 minute to 1 hour,
  and cap the offline queue at 500 events. The server refuses events older
  than 7 days.

## Storage and retention

Ingest writes two tables in `@nodetool-ai/models`:

- `nodetool_analytics_events`: the raw envelope plus the day it was received.
  Rows are deleted after 30 days by a daily sweep.
- `nodetool_analytics_daily`: counts per day, event, client type, platform,
  app version and property set, with no IDs. These are kept.

Neither table has a column for an IP address, header, user agent or account.
Both have row-level security with no policy on PostgreSQL, so only the server
role can read them.

## Configuration

| Variable | Where | Effect |
|---|---|---|
| `NODETOOL_TELEMETRY=0` | CLI, backend | Off, whatever consent says |
| `DO_NOT_TRACK=1` | CLI, backend | Off, whatever consent says |
| `NODETOOL_ANALYTICS_ENDPOINT` | CLI, server relay | Destination. Must be https (the CLI also accepts localhost http) |
| `NODETOOL_ANALYTICS_INGEST=1` | server | Store batches instead of relaying |
| `NODETOOL_ANALYTICS_RELAY=0` | server | Discard browser batches |
| `NODETOOL_ANALYTICS_BACKEND=1` | cloud server | Emit `cloud_backend` execution events |

Backend events are product analytics only. Latency, queue depth, worker health
and resource use belong to the OpenTelemetry pipeline in
[`packages/runtime`](../packages/runtime/src/telemetry.ts).

## Operator checklist

The ingest code stores no IP address, but the network path in front of it can.
Before enabling ingest on a public host:

1. Turn off access logs, or drop the client IP and user agent from them, on the
   load balancer, CDN and reverse proxy in front of the analytics endpoint.
2. Keep Fastify's logger off for the analytics server (`logger: false` is the
   default in `packages/websocket/src/server.ts`).
3. Confirm no error tracker or APM captures request bodies or headers on that
   route.
4. Keep the retention sweep running: it starts with the server in ingest mode.
