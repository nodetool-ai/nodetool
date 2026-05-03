---
layout: page
title: "GraphQL Batch Query"
node_type: "lib.graphql.BatchQuery"
namespace: "lib.graphql"
---

**Type:** `lib.graphql.BatchQuery`

**Namespace:** `lib.graphql`

## Description

Execute multiple GraphQL operations in a single batch request.
    graphql, batch, query, mutation, api, bulk

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| url | `str` | GraphQL API endpoint URL | `` |
| queries_json | `str` | JSON array of {query, variables, operationName} objects | `[]` |
| headers | `str` | Optional JSON object of additional HTTP headers | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |
| status | `int` |  |

## Related Nodes

Browse other nodes in the [lib.graphql](../) namespace.
