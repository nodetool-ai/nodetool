---
layout: page
title: "Send Email"
node_type: "lib.mail.SendEmail"
namespace: "lib.mail"
---

**Type:** `lib.mail.SendEmail`

**Namespace:** `lib.mail`

## Description

Sends an email from a Gmail account over SMTP with a Google app password. Recipients are plain addresses separated by commas. Attachments are not supported.
    email, gmail, send, smtp, mail

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| to | `str` | Recipient email addresses, separated by commas | `` |
| cc | `str` | Cc email addresses, separated by commas | `` |
| bcc | `str` | Bcc email addresses, separated by commas | `` |
| subject | `str` | Subject line. It must be a single line. | `` |
| text | `str` | Plain text body | `` |
| html | `str` | Optional HTML body. Mail clients that show HTML use it, the others use the text body. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| message_id | `str` |  |
| accepted | `list[str]` |  |
| rejected | `list[str]` |  |

## Related Nodes

Browse other nodes in the [lib.mail](./) namespace.
