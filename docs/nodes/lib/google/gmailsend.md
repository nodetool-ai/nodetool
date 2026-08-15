---
layout: page
title: "Gmail Send"
node_type: "lib.google.GmailSend"
namespace: "lib.google"
---

**Type:** `lib.google.GmailSend`

**Namespace:** `lib.google`

## Description

Send a plain-text email from the signed-in user's Gmail account.
    google, gmail, email, send, message

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| to | `str` | Recipient address(es), comma-separated | `` |
| subject | `str` | Subject line | `` |
| body | `str` | Plain-text body | `` |
| cc | `str` | Cc address(es), comma-separated | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.google](./) namespace.
