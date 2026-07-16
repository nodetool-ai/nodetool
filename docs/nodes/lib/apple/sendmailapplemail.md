---
layout: page
title: "Send Mail (Apple Mail)"
node_type: "lib.apple.SendMail"
namespace: "lib.apple"
---

**Type:** `lib.apple.SendMail`

**Namespace:** `lib.apple`

## Description

Compose and send an email through Apple Mail via AppleScript.
    mail, email, send, macos

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| to_address | `str` | Recipient email address | `` |
| cc_address | `str` | CC email address (optional) | `` |
| subject | `str` | Email subject | `` |
| body | `str` | Email body (plain text) | `` |
| visible | `bool` | Show the message in the UI rather than sending silently | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Related Nodes

Browse other nodes in the [lib.apple](./) namespace.
