---
layout: page
title: "Send WhatsApp"
node_type: "lib.twilio.SendWhatsApp"
namespace: "lib.twilio"
---

**Type:** `lib.twilio.SendWhatsApp`

**Namespace:** `lib.twilio`

## Description

Send a WhatsApp message via the Twilio REST API.
    twilio, whatsapp, message, send

    Use cases:
    - Send WhatsApp notifications
    - Automate WhatsApp customer messages
    - Send rich media via WhatsApp

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| to | `str` | Recipient phone number in E.164 format (e.g. +15551234567) | `` |
| from_number | `str` | Twilio WhatsApp-enabled phone number in E.164 format (e.g. +15559876543) | `` |
| body | `str` | The text content of the WhatsApp message | `` |
| account_sid | `str` | Twilio Account SID (optional — falls back to TWILIO_ACCOUNT_SID secret) | `` |
| auth_token | `str` | Twilio Auth Token (optional — falls back to TWILIO_AUTH_TOKEN secret) | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.twilio](../) namespace.
