---
layout: page
title: "Notion Update Page"
node_type: "lib.notion.UpdatePage"
namespace: "lib.notion"
---

**Type:** `lib.notion.UpdatePage`

**Namespace:** `lib.notion`

## Description

Update properties of an existing Notion page.
    notion, page, update, edit, modify, api

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| page_id | `str` | The ID of the page to update | `` |
| properties_json | `str` | JSON object of properties to update | `` |
| archived | `bool` | Set to true to archive (soft-delete) the page | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.notion](../) namespace.
