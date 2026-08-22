# Lib Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **Lib**

This directory contains integrations with external libraries (WebSocket, Supabase, Frontend Tools).

## Rules

### Frontend Tools

- Prefix tool names with `ui_` to distinguish from backend tools (e.g. `ui_add_node`).
- Define JSON Schema for all tool parameters with descriptions.
- Mark required vs optional parameters.
- `execute` returns the result payload on success (`{ok: true, …}` where the
  tool reports status). On failure, throw `Error` — do not return
  `{success: false}`. The runners own error conversion:
  `GlobalWebSocketManager` catches the throw and answers the server with
  `{ok: false, error: message}`, and tests pin rejection with
  `.rejects.toThrow(...)` for every failure path.
- A tool that mutates a document also returns `url` — the `<kind>://<id>`
  resource link (e.g. `timeline://tl_7#clip=cl_2`) built with `docUrl`
  (`tools/builtin/resourceLinks.ts`), so the agent can link what it changed.
  Read-only and selection tools return no `url`.
- Write actionable errors. A failure is what the calling agent reads to
  recover — name the remedy (which tool opens the document, which handle
  exists) rather than restating the input.

### WebSocket

- Use `GlobalWebSocketManager` singleton for workflow connections — don't create new WebSocket instances.
- Always subscribe to updates and return the unsubscribe function.
- Clean up subscriptions in `useEffect` cleanup.
- Validate all incoming messages before processing.
- **Every run-submission path must set `concurrent: true` on the `run_job`
  payload.** Without it the backend serializes the run behind any in-flight
  same-workflow run. When you add a new way to launch a run (e.g.
  `runInlineGraphJob` for Run-from-here / node context-menu), match the flag the
  other paths use — an unset flag silently queues the run instead of running it
  alongside the others.

### Supabase

- Check session before making authenticated API calls.
- Handle auth state changes gracefully.
- Use environment variables for Supabase URL and keys — never hardcode.

## Testing

- Mock WebSocket connections in tests.
- Mock Supabase client methods.
- Test tool registration and execution independently.
