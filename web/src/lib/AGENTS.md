# Lib Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **Lib**

This directory contains integrations with external libraries (WebSocket, Supabase, Frontend Tools).

## Rules

### Frontend Tools

- Prefix tool names with `ui_` to distinguish from backend tools (e.g., `ui_add_node`).
- Define JSON Schema for all tool parameters with descriptions.
- Mark required vs optional parameters.
- Always return `{ success: true }` or `{ success: false, error: message }`.
- Handle errors inside `execute` — don't let exceptions propagate.

### WebSocket

- Use `GlobalWebSocketManager` singleton for workflow connections — don't create new WebSocket instances.
- Always subscribe to updates and return the unsubscribe function.
- Clean up subscriptions in `useEffect` cleanup.
- Validate all incoming messages before processing.

### Supabase

- Check session before making authenticated API calls.
- Handle auth state changes gracefully.
- Use environment variables for Supabase URL and keys — never hardcode.

## Testing

- Mock WebSocket connections in tests.
- Mock Supabase client methods.
- Test tool registration and execution independently.
