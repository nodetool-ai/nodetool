---
layout: page
title: "Agent"
node_type: "nodetool.agents.Agent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.Agent`

**Namespace:** `nodetool.agents`

## Description

Chat with an LLM: send a prompt (plus optional images or audio), call tools, and stream back the response.
    agent, llm, chat, text-generation, tools, streaming

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model to use for execution | `{"type":"language_model","provider":"empty","id...` |
| mode | `enum` | How the agent runs.  • loop: standard tool‑calling loop — the LLM responds to the prompt and may iteratively call the connected tools until it produces a final answer. Use this for chat, Q&A, and most tool‑using tasks. • plan: the LLM first drafts a multi‑step task plan from the objective, then executes the steps in dependency order (independent steps run in parallel). Best for longer, structured jobs with clear sub‑tasks. | `loop` |
| system | `str` | Instructions that define the agent's persona, role, tone, and global behaviour. Sent to the model as the system message at the start of every run, before any history or user prompt. Use it for things that should always hold (e.g. "You are a senior Python reviewer. Reply in Markdown."). Leave the prompt itself for the per‑run task. | `You are a friendly assistant` |
| prompt | `str` | The user message for this run — the actual question, task, or content the agent should act on. Appended after the system prompt and conversation history as the latest user turn. Any connected Image or Audio inputs are attached to this message. In plan and multi-agent modes this is treated as the objective for planning. | `` |
| tools | `list[tool_name]` | Tools to enable for the agent. Select workspace tools (read_file, write_file, list_directory) to enable file operations. | `[]` |
| image | `list[image]` | Images to attach to the prompt. Wire a list[image] source to send several at once, or a single Image (auto-wrapped into a one-item list). Each image becomes a separate block in the user message sent to the provider. | `[]` |
| audio | `list[audio]` | Audio clips to attach to the prompt. Wire a list[audio] source to send several at once, or a single Audio (auto-wrapped into a one-item list). Each clip becomes a separate block in the user message sent to the provider. | `[]` |
| history | `list[message]` | Prior conversation turns to include before the current prompt, in chronological order (oldest first). Each item is a Message with a role (user/assistant/tool) and content. Use this to supply ad‑hoc context — for example, few‑shot examples, a previous chat transcript piped in from another node, or the messages output of an upstream Agent. Inserted between the system prompt and the new user prompt. If a Thread ID is also set, history loaded from the thread comes first, then this list, then the current prompt. | `[]` |
| thread_id | `str` | Identifier for a persistent conversation thread. When set, the agent loads all earlier messages stored under this ID before this turn and saves the new user message, assistant reply, and any tool messages back to it — giving the agent long‑term memory across runs and across nodes that share the same ID. Leave empty for a stateless one‑shot call. Use the Create Thread node to mint a fresh ID, or wire in the same string from upstream to continue an existing conversation. | `` |
| max_tokens | `int` | Upper bound on generated tokens per response, including visible output and any reasoning/thinking tokens used by reasoning models. Higher values allow longer answers and more thinking headroom but cost more and take longer; very low values may truncate reasoning or the final answer. Typical values: 1024 for short answers, 8192–16384 for normal agent use, 32k+ for long-form or heavy reasoning. Must be within the chosen model's context window. | - |
| max_turns | `int` | Upper bound on agentic turns — one turn is a model call plus any tool execution it triggers. Caps both the AgentNode tool-loop iteration count and the provider's internal multi-turn budget (e.g. Claude Agent SDK). Raise for long sandbox sessions; lower to fail fast on runaway loops. | `100` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| chunk | `chunk` |  |
| thinking | `chunk` |  |
| audio | `audio` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](./) namespace.
