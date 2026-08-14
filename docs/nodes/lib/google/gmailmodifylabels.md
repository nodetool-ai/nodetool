---
layout: page
title: "Gmail Modify Labels"
node_type: "lib.google.GmailModifyLabels"
namespace: "lib.google"
---

**Type:** `lib.google.GmailModifyLabels`

**Namespace:** `lib.google`

## Description

Add or remove Gmail labels on a message. Archive by removing INBOX.
    google, gmail, label, archive, organize

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| message_id | `str` | Gmail message id | `` |
| add_labels | `str` | Label ids to add, comma-separated | `` |
| remove_labels | `str` | Label ids to remove, comma-separated | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.google](./) namespace.
