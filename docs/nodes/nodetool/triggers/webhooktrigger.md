---
layout: page
title: "Webhook Trigger"
node_type: "nodetool.triggers.WebhookTrigger"
namespace: "nodetool.triggers"
---

**Type:** `nodetool.triggers.WebhookTrigger`

**Namespace:** `nodetool.triggers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| max_events | `int` | Maximum number of events to process (0 = unlimited) | `0` |
| port | `int` | Port to listen on for webhook requests | `8080` |
| path | `str` | URL path to listen on | `/webhook` |
| host | `str` | Host address to bind to. Use '0.0.0.0' to listen on all interfaces. | `127.0.0.1` |
| methods | `list[str]` | HTTP methods to accept | `["POST"]` |
| secret | `str` | Optional secret for validating requests (checks X-Webhook-Secret header) | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| body | `any` |  |
| headers | `dict[str, any]` |  |
| query | `dict[str, any]` |  |
| method | `str` |  |
| path | `str` |  |
| timestamp | `str` |  |
| source | `str` |  |
| event_type | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.triggers](../) namespace.
