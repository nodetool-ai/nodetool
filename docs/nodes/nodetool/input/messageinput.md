---
layout: page
title: "Message Input"
node_type: "nodetool.input.MessageInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.MessageInput`

**Namespace:** `nodetool.input`

## Description

Accepts a chat message object for workflows.
    input, parameter, message, chat, conversation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `message` | The message object containing role, content, and metadata. | `{"type":"message","id":null,"workflow_id":null,...` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `message` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
