---
layout: page
title: "Lookup Phone Number"
node_type: "lib.twilio.Lookup"
namespace: "lib.twilio"
---

**Type:** `lib.twilio.Lookup`

**Namespace:** `lib.twilio`

## Description

Look up phone number information using the Twilio Lookup API.
    twilio, phone, lookup, carrier, number

    Use cases:
    - Validate phone numbers
    - Get carrier information
    - Determine phone number type (mobile, landline)

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| phone_number | `str` | Phone number to look up in E.164 format (e.g. +15551234567) | `` |
| account_sid | `str` | Twilio Account SID (optional — falls back to TWILIO_ACCOUNT_SID secret) | `` |
| auth_token | `str` | Twilio Auth Token (optional — falls back to TWILIO_AUTH_TOKEN secret) | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.twilio](../) namespace.
