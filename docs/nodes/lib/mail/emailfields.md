---
layout: page
title: "Email Fields"
node_type: "lib.mail.EmailFields"
namespace: "lib.mail"
---

**Type:** `lib.mail.EmailFields`

**Namespace:** `lib.mail`

## Description

Decomposes an email into its individual components.
    email, decompose, extract

    Takes an Email object and returns its individual fields:
    - id: Message ID
    - subject: Email subject
    - sender: Sender address
    - date: Datetime of email
    - body: Email body content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| email | `any` | Email object to decompose | `{'type': 'email', 'id': '', 'sender': '', 'subject': '', 'date': {'type': 'datetime', 'year': 0, 'month': 0, 'day': 0, 'hour': 0, 'minute': 0, 'second': 0, 'microsecond': 0, 'tzinfo': 'UTC', 'utc_offset': 0}, 'body': ''}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| id | `any` |  |
| subject | `any` |  |
| sender | `any` |  |
| date | `any` |  |
| body | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.mail](../) namespace.

