---
layout: page
title: "Notion Get Page Content"
node_type: "lib.notion.GetPageContent"
namespace: "lib.notion"
---

**Type:** `lib.notion.GetPageContent`

**Namespace:** `lib.notion`

## Description

Retrieve all blocks (content) of a Notion page.
    notion, page, content, blocks, read, api

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| page_id | `str` | The ID of the Notion page | `` |
| page_size | `int` | Number of blocks to retrieve (max 100) | `100` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| block | `dict` |  |
| blocks | `list` |  |

## Related Nodes

Browse other nodes in the [lib.notion](../) namespace.
