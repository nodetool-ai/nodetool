---
layout: page
title: "Message List Input"
node_type: "nodetool.input.MessageListInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.MessageListInput`

**Namespace:** `nodetool.input`

## Description

Accepts a list of chat message objects for workflows.
    input, parameter, messages, chat, conversation, history

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `list[message]` | The list of message objects representing chat history. | `[]` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[message]` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
