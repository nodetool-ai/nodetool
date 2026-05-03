---
layout: page
title: "Gmail Search"
node_type: "lib.mail.GmailSearch"
namespace: "lib.mail"
---

**Type:** `lib.mail.GmailSearch`

**Namespace:** `lib.mail`

## Description

Searches Gmail using Gmail-specific search operators and yields matching emails.
    email, gmail, search

    Use cases:
    - Search for emails based on specific criteria
    - Retrieve emails from a specific sender
    - Filter emails by subject, sender, or date

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| from_address | `str` | Sender's email address to search for | `` |
| to_address | `str` | Recipient's email address to search for | `` |
| subject | `str` | Text to search for in email subject | `` |
| body | `str` | Text to search for in email body | `` |
| date_filter | `enum` | Date filter to search for | `SINCE_ONE_DAY` |
| keywords | `str` | Custom keywords or labels to search for | `` |
| folder | `enum` | Email folder to search in | `INBOX` |
| text | `str` | General text to search for anywhere in the email | `` |
| max_results | `int` | Maximum number of emails to return | `50` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| email | `dict` |  |
| message_id | `str` |  |
| emails | `list` |  |
| message_ids | `list` |  |

## Related Nodes

Browse other nodes in the [lib.mail](../) namespace.
