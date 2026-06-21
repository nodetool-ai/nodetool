---
layout: page
title: "Claude Code Agent"
node_type: "nodetool.agents.ClaudeCodeAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.ClaudeCodeAgent`

**Namespace:** `nodetool.agents`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | Instructions for this agent (its role/task). Combined with `input` when both are set. | `` |
| input | `str` | Hand-off text from an upstream agent (wire another node's `text` output here). Appended after the prompt. | `` |
| session_name | `str` | tmux session name. Empty: auto-generated. With `keep_session`, reusing the same name continues the same Claude conversation across runs. | `` |
| keep_session | `bool` | Leave the tmux session (and Claude conversation) running after the turn completes, so follow-up prompts share context. | `false` |
| model | `str` | Optional model override passed as --model (e.g. opus, sonnet). | `` |
| system_prompt | `str` | Optional text passed as --append-system-prompt (e.g. 'You are a strict code reviewer'). | `` |
| extra_args | `str` | Extra CLI arguments appended verbatim to the claude command. | `` |
| command | `str` | Claude Code binary to launch. | `claude` |
| timeout_seconds | `int` | Maximum time to wait for the agent to finish the turn. | `900` |
| quiet_period_seconds | `float` | How long the session log must stay quiet (with the terminal idle) before the turn counts as finished. | `3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| chunk | `chunk` |  |
| transcript | `str` |  |
| session_id | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](./) namespace.
