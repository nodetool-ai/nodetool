---
layout: page
title: "Get Messages"
node_type: "lib.twilio.GetMessages"
namespace: "lib.twilio"
---

**Type:** `lib.twilio.GetMessages`

**Namespace:** `lib.twilio`

## Description

List recent SMS/MMS messages from a Twilio account.
    twilio, sms, messages, list, history

    Use cases:
    - Retrieve message history
    - Monitor incoming messages
    - Audit sent messages

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| limit | `int` | Maximum number of messages to return (1-1000) | `20` |
| to | `str` | Filter by recipient phone number | `` |
| from_number | `str` | Filter by sender phone number | `` |
| date_sent | `str` | Filter by date sent (YYYY-MM-DD) | `` |
| account_sid | `str` | Twilio Account SID (optional — falls back to TWILIO_ACCOUNT_SID secret) | `` |
| auth_token | `str` | Twilio Auth Token (optional — falls back to TWILIO_AUTH_TOKEN secret) | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| message | `dict` |  |
| messages | `list` |  |

## Related Nodes

Browse other nodes in the [lib.twilio](../) namespace.
