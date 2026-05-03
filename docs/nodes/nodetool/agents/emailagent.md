---
layout: page
title: "Email Agent"
node_type: "nodetool.agents.EmailAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.EmailAgent`

**Namespace:** `nodetool.agents`

## Description

Prompt-driven email skill for IMAP/SMTP and message processing tasks.
    skills, email, imap, smtp, messaging

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for task planning and execution reasoning. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | Prompt describing the requested task. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `180` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `200000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
