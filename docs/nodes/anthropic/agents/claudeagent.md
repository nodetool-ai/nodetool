---
layout: page
title: "Claude Agent"
node_type: "anthropic.agents.ClaudeAgent"
namespace: "anthropic.agents"
---

**Type:** `anthropic.agents.ClaudeAgent`

**Namespace:** `anthropic.agents`

## Description

Run Claude as an agent in a sandboxed environment with tool use capabilities.
    claude, agent, ai, anthropic, sandbox, assistant

    Uses the Claude Agent SDK to run Claude with access to tools in a secure sandbox.
    The agent can execute commands, read/write files, and use various tools while
    maintaining security through sandbox isolation.

    Use cases:
    - Automated coding and debugging tasks
    - File manipulation and analysis
    - Complex multi-step workflows
    - Research and data gathering

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | The task or question for the Claude agent to work on. | `` |
| model | `language_model` | The Claude compatible model to use for the agent. | `{"type":"language_model","provider":"empty","id...` |
| system_prompt | `str` | Optional system prompt to guide the agent's behavior. | `` |
| max_turns | `int` | Maximum number of turns the agent can take. | `20` |
| allowed_tools | `list[str]` | List of tools the agent is allowed to use (e.g., 'Read', 'Write', 'Bash'). | `["Read","Write","Bash"]` |
| permission_mode | `enum` | Permission mode for tool usage. | `acceptEdits` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [anthropic.agents](../) namespace.
