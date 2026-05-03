---
layout: page
title: "Notion Create Page"
node_type: "lib.notion.CreatePage"
namespace: "lib.notion"
---

**Type:** `lib.notion.CreatePage`

**Namespace:** `lib.notion`

## Description

Create a new page in a Notion database or as a child of another page.
    notion, page, create, add, api

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| parent_id | `str` | The ID of the parent database or page | `` |
| parent_type | `str` | Type of parent: "database_id" or "page_id" | `database_id` |
| title | `str` | Title of the new page | `` |
| title_property | `str` | Name of the database title column (default: Name). Only used for database parents. | `Name` |
| properties_json | `str` | Optional extra properties as a JSON object (merged with title) | `` |
| content_json | `str` | Optional children blocks as a JSON array | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.notion](../) namespace.
