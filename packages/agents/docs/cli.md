# Running Agents from CLI

**Navigation**: [Agents package rules](../AGENTS.md) → **Running Agents from CLI**

Paths are relative to `packages/agents/` unless they name another package.

### Interactive Chat

Every session runs the unified agent loop; `-a, --agent` and `--no-agent` are
accepted for backwards compatibility and do nothing.

```bash
# Start a session
nodetool-chat

# With specific provider and model
nodetool-chat --provider anthropic --model claude-sonnet-5

# With workspace directory
nodetool-chat --workspace /path/to/project

# Connect to WebSocket server
nodetool-chat --url ws://localhost:7777/ws
```

### Piped Input

```bash
echo "Summarize this codebase" | nodetool-chat --provider anthropic
```

### Interactive Commands

`CHAT_COMMANDS` in `packages/cli-chat/src/app.tsx` is the list; anything else prints
`Unknown command`. Every session runs the unified agent loop. `/agent` inspects
the sub-agent threads created by that loop. It does not switch agent modes.

```
/help     — Show available commands
/new      — Start a new chat session
/clear    — Clear conversation history
/compact  — Summarize conversation into retained context: /compact [instructions]
/model    — Set provider and model: /model <provider/model-id>
/agent    — Inspect sub-agent threads: /agent [id|main]
/tools    — List enabled tools
/exit     — Exit the chat
/quit     — Exit the chat
```

### `nodetool agent run`

An objective is one CodeAct turn over the same belt chat uses, so there is no
second loop to configure. `packages/cli-chat/src/commands/agent.ts` assembles it:
`buildCliAgentBelt({ ..., planning: true })` puts `create_plan` and
`execute_plan` on the belt, `createCliCodeActTurn` turns that belt into the
`execute_code` action plus the direct tools, and `processChat` runs the turn.
The model decides whether the objective wants decomposing; nothing plans on its
behalf.

The stream is the same `ProcessingMessage` union every host emits — `chunk`,
`planning_update`, `task_update`, `tool_call_update`, `tool_result_update`,
`step_result`, `log_update` — which is why `--json` output and the chat
renderer read the same events.

To build a session of your own, use `createChatCodeActSession`
(`src/codeact/chat-codeact.ts`) rather than assembling an executor: it owns the
system prompt, the sandbox package allowlist, the resident/direct tool split,
and the clock that stops the action budget while a permission prompt is open.
