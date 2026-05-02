---
layout: page
title: "Send Email"
node_type: "lib.mail.SendEmail"
namespace: "lib.mail"
---

**Type:** `lib.mail.SendEmail`

**Namespace:** `lib.mail`

## Description

Send a plain text email via SMTP.
    email, smtp, send

    Use cases:
    - Send simple notification messages
    - Automate email reports

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| smtp_server | `str` | SMTP server hostname | `smtp.gmail.com` |
| smtp_port | `int` | SMTP server port | `587` |
| username | `str` | SMTP username | `` |
| password | `str` | SMTP password | `` |
| from_address | `str` | Sender email address | `` |
| to_address | `str` | Recipient email address | `` |
| subject | `str` | Email subject | `` |
| body | `str` | Email body | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Related Nodes

Browse other nodes in the [lib.mail](../) namespace.
