---
layout: page
title: "Message Deconstructor"
node_type: "nodetool.input.MessageDeconstructor"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.MessageDeconstructor`

**Namespace:** `nodetool.input`

## Description

Deconstructs a chat message object into its individual fields.
    extract, decompose, message, fields, chat

    Use cases:
    - Extract specific fields from a message (e.g., role, content, thread_id).
    - Access message metadata for workflow logic.
    - Process different parts of a message separately.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `message` | The message object to deconstruct. | `{"type":"message","id":null,"workflow_id":null,...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| id | `str` |  |
| thread_id | `str` |  |
| role | `str` |  |
| text | `str` |  |
| image | `image` |  |
| audio | `audio` |  |
| model | `language_model` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
