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
|----------|------|-------------|----------|
| smtp_server | `any` | SMTP server hostname | `smtp.gmail.com` |
| smtp_port | `any` | SMTP server port | `587` |
| username | `any` | SMTP username | `` |
| password | `any` | SMTP password | `` |
| from_address | `any` | Sender email address | `` |
| to_address | `any` | Recipient email address | `` |
| subject | `any` | Email subject | `` |
| body | `any` | Email body | `` |
| retry_attempts | `any` | Maximum retry attempts for SMTP send | `3` |
| retry_base_delay | `any` | Base delay (seconds) for exponential backoff | `0.5` |
| retry_max_delay | `any` | Maximum delay (seconds) for exponential backoff | `5.0` |
| retry_factor | `any` | Exponential growth factor for backoff | `2.0` |
| retry_jitter | `any` | Random jitter (seconds) added to each backoff | `0.1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.mail](../) namespace.

