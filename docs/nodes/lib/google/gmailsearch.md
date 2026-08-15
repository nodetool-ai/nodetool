---
layout: page
title: "Gmail Search"
node_type: "lib.google.GmailSearch"
namespace: "lib.google"
---

**Type:** `lib.google.GmailSearch`

**Namespace:** `lib.google`

## Description

Search Gmail with Gmail query syntax and return parsed messages.
    google, gmail, email, search, inbox

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| query | `str` | Gmail query, e.g. 'from:alice@example.com newer_than:7d' | `` |
| max_results | `int` | Maximum number of messages to return | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |
| outputs | `list` |  |

## Related Nodes

Browse other nodes in the [lib.google](./) namespace.
