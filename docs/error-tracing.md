---
layout: page
title: "Error Tracing"
description: "How NodeTool records redacted error traces in its own database, exposes them to agents and bug reports, and makes them queryable in Supabase."
---

# Error Tracing

NodeTool records server failures, failed workflow runs and client crashes as
redacted error traces in its own database. Agents can query them, a bug report
can attach them, and on the hosted service they are queryable in Supabase.
Nothing is sent to a third-party error tracker.

## What is recorded

| Source | When |
|---|---|
| `trpc` | A tRPC procedure fails with a 5xx status |
| `http` | A REST handler throws with a 5xx status |
| `job` | A workflow run fails, or fails before it starts |
| `web` / `electron` | The route error boundary or a panel error boundary catches a crash |

Client mistakes (4xx) are not traced. Each trace stores the error type, the
message, the stack, a fingerprint that groups repeats, the app version, the
platform, and a small context. The context keeps only identifiers listed in
`ERROR_TRACE_CONTEXT_KEYS` (`packages/models/src/error-trace-redaction.ts`):
job, workflow, node and thread ids, the route, the HTTP status and similar.
Prompts, node inputs, outputs and request bodies are never stored.

## Redaction

`redactErrorTrace` runs before every insert, on both the local capture path
and the sync ingest path. It removes provider credentials by shape, JWTs,
bearer tokens, PEM keys, secret-named `key=value` pairs, signed URL
parameters, URL credentials, the values of credential variables in the server
environment, email addresses, non-loopback IPv4 addresses, home-directory
names, `data:` URLs and long opaque strings. Messages are capped at 2,000
characters and stacks at 40 frames. The table is in the
[personal-data registry](../packages/models/src/personal-data-registry.ts), so
account export includes the traces and account erasure deletes them.

A process stores at most 10 traces of one fingerprint and 300 traces in total
per minute. Traces older than 30 days are pruned at startup and once a day.

## Reading traces

| Surface | How |
|---|---|
| Agents (chat and MCP) | `list_error_traces`, `get_error_trace`, `export_error_report` |
| CLI | `nodetool errors list`, `show <id>`, `export [ids…] [-o file]`, `sync`, `prune` |
| tRPC | `errorTraces.list`, `summary`, `get`, `report` |
| Bug report dialog | The "Recent server errors" section attaches the last hour as `server-errors.md` |

Every surface reads only the caller's own traces. A trace id can be given in
full or as its 12-character prefix.

## Supabase

On a deployment whose database is Supabase PostgreSQL, the traces live in
`nodetool_error_traces` in that database. The `create_error_traces` migration
enables row-level security and adds the `error_traces_owner_read` policy, so
the Supabase Data API returns a signed-in user only their own rows and returns
nothing to anonymous callers. The server connects as the table owner and is
not affected. Query across users in the Supabase SQL editor, for example:

```sql
SELECT fingerprint, count(*), max(created_at) AS last_seen, min(message) AS message
FROM nodetool_error_traces
WHERE created_at > (now() - interval '1 day')::text
GROUP BY fingerprint
ORDER BY count(*) DESC;
```

## Syncing a local install

Sync is off by default. To push a local install's traces to a NodeTool server,
set both variables:

| Variable | Value |
|---|---|
| `NODETOOL_ERROR_TRACE_SYNC_URL` | The server's base URL. Must be `https`, except for localhost |
| `NODETOOL_ERROR_TRACE_SYNC_TOKEN` | An access token for your account on that server |

The server then pushes unsynced local traces every 5 minutes to
`errorTraces.ingest`, and `nodetool errors sync` pushes them on demand. The
receiving server stores them under the token's user and redacts them again.
Received traces are never forwarded. A local install never holds database
credentials for the cloud.

## Other settings

| Variable | Effect |
|---|---|
| `NODETOOL_ERROR_TRACES` | `0`, `false` or `off` stops server-side capture |
| `NODETOOL_ERROR_TRACE_RETENTION_DAYS` | Retention window in days. Default 30 |
