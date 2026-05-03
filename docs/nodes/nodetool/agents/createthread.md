---
layout: page
title: "Create Thread"
node_type: "nodetool.agents.CreateThread"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.CreateThread`

**Namespace:** `nodetool.agents`

## Description

Create a new conversation thread and return its ID.
    threads, chat, conversation, context

    Use this to seed a thread_id that downstream Agent nodes can reuse for
    persistent history across the graph or multiple runs.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| title | `str` | Optional title for the new thread | `Agent Conversation` |
| thread_id | `str` | Optional custom thread ID. If provided and owned by the user, it will be reused; otherwise a new thread is created. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| thread_id | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
