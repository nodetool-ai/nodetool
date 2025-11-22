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
| from_address | `any` | Sender's email address to search for | `` |
| to_address | `any` | Recipient's email address to search for | `` |
| subject | `any` | Text to search for in email subject | `` |
| body | `any` | Text to search for in email body | `` |
| date_filter | `any` | Date filter to search for | `SINCE_ONE_DAY` |
| keywords | `any` | Custom keywords or labels to search for | `` |
| folder | `any` | Email folder to search in | `INBOX` |
| text | `any` | General text to search for anywhere in the email | `` |
| max_results | `any` | Maximum number of emails to return | `50` |
| retry_attempts | `any` | Maximum retry attempts for Gmail operations | `3` |
| retry_base_delay | `any` | Base delay (seconds) for exponential backoff | `0.5` |
| retry_max_delay | `any` | Maximum delay (seconds) for exponential backoff | `5.0` |
| retry_factor | `any` | Exponential growth factor for backoff | `2.0` |
| retry_jitter | `any` | Random jitter (seconds) added to each backoff | `0.1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| email | `any` |  |
| message_id | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.mail](../) namespace.

