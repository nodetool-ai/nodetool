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
|----------|------|-------------|----------|
| from_address | `str` | Sender's email address to search for | `` |
| to_address | `str` | Recipient's email address to search for | `` |
| subject | `str` | Text to search for in email subject | `` |
| body | `str` | Text to search for in email body | `` |
| date_filter | `Enum['SINCE_ONE_HOUR', 'SINCE_ONE_DAY', 'SINCE_ONE_WEEK', 'SINCE_ONE_MONTH', 'SINCE_ONE_YEAR']` | Date filter to search for | `SINCE_ONE_DAY` |
| keywords | `str` | Custom keywords or labels to search for | `` |
| folder | `Enum['INBOX', '[Gmail]/Sent Mail', '[Gmail]/Drafts', '[Gmail]/Spam', '[Gmail]/Trash']` | Email folder to search in | `INBOX` |
| text | `str` | General text to search for anywhere in the email | `` |
| max_results | `int` | Maximum number of emails to return | `50` |
| retry_attempts | `int` | Maximum retry attempts for Gmail operations | `3` |
| retry_base_delay | `float` | Base delay (seconds) for exponential backoff | `0.5` |
| retry_max_delay | `float` | Maximum delay (seconds) for exponential backoff | `5.0` |
| retry_factor | `float` | Exponential growth factor for backoff | `2.0` |
| retry_jitter | `float` | Random jitter (seconds) added to each backoff | `0.1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| email | `email` |  |
| message_id | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.mail](../) namespace.

