---
layout: page
title: "Agent"
node_type: "nodetool.agents.Agent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.Agent`

**Namespace:** `nodetool.agents`

## Description

Generate natural language responses using LLM providers and streams output.
    llm, text-generation, chatbot, question-answering, streaming

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | Model to use for execution | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| system | `any` | The system prompt for the LLM | `You are a an AI agent. 

Behavior
- Understand the user's intent and the context of the task.
- Break down the task into smaller steps.
- Be precise, concise, and actionable.
- Use tools to accomplish your goal. 

Tool preambles
- Outline the next step(s) you will perform.
- After acting, summarize the outcome.

Rendering
- Use Markdown to display media assets.
- Display images, audio, and video assets using the appropriate Markdown.

File handling
- Inputs and outputs are files in the /workspace directory.
- Write outputs of code execution to the /workspace directory.
` |
| prompt | `any` | The prompt for the LLM | `` |
| image | `any` | The image to analyze | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| audio | `any` | The audio to analyze | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| history | `any` | The messages for the LLM | `[]` |
| thread_id | `any` | Optional thread ID for persistent conversation history. If provided, messages will be loaded from and saved to this thread. | - |
| max_tokens | `any` |  | `8192` |
| context_window | `any` |  | `4096` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `any` |  |
| chunk | `any` |  |
| audio | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.

