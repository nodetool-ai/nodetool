---
layout: page
title: "Email Trigger"
node_type: "lib.mail.EmailTrigger"
namespace: "lib.mail"
---

**Type:** `lib.mail.EmailTrigger`

**Namespace:** `lib.mail`

## Description

Starts a workflow in the background when new mail arrives in a Gmail folder. The server checks the folder over IMAP on a schedule and starts one run for each new message. Mail that is already there when the trigger is turned on does not start a run.
    trigger, email, gmail, imap, mail, inbox, new mail

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| folder | `enum` | Email folder to watch | `INBOX` |
| from_address | `str` | Only start a run for mail from this sender | `` |
| subject | `str` | Only start a run for mail whose subject contains this text | `` |
| interval_seconds | `float` |  | `60` |
| max_messages | `int` | Most new messages that start a run in one check. The rest wait for the next check. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| email | `dict` |  |
| message_id | `str` |  |
| subject | `str` |  |
| sender | `str` |  |
| date | `str` |  |
| body | `str` |  |
| source | `str` |  |
| event_type | `str` |  |

## Related Nodes

Browse other nodes in the [lib.mail](./) namespace.
