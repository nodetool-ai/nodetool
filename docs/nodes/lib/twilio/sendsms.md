---
layout: page
title: "Send SMS"
node_type: "lib.twilio.SendSMS"
namespace: "lib.twilio"
---

**Type:** `lib.twilio.SendSMS`

**Namespace:** `lib.twilio`

## Description

Send an SMS message via the Twilio REST API.
    twilio, sms, text, send, message

    Use cases:
    - Send notification texts
    - Automate SMS alerts
    - Send verification codes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| to | `str` | Recipient phone number in E.164 format (e.g. +15551234567) | `` |
| from_number | `str` | Twilio phone number to send from in E.164 format (e.g. +15559876543) | `` |
| body | `str` | The text content of the SMS message | `` |
| account_sid | `str` | Twilio Account SID (optional — falls back to TWILIO_ACCOUNT_SID secret) | `` |
| auth_token | `str` | Twilio Auth Token (optional — falls back to TWILIO_AUTH_TOKEN secret) | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.twilio](../) namespace.
