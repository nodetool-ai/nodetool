---
layout: page
title: "GraphQL Query"
node_type: "lib.graphql.Query"
namespace: "lib.graphql"
---

**Type:** `lib.graphql.Query`

**Namespace:** `lib.graphql`

## Description

Execute a GraphQL query or mutation against any endpoint.
    graphql, query, mutation, api, post

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| url | `str` | GraphQL API endpoint URL | `` |
| query | `str` | GraphQL query or mutation string | `` |
| variables | `str` | Optional JSON object of query variables | `` |
| headers | `str` | Optional JSON object of additional HTTP headers | `` |
| operation_name | `str` | Optional operation name for multi-operation documents | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| data | `any` |  |
| errors | `list` |  |
| status | `int` |  |

## Related Nodes

Browse other nodes in the [lib.graphql](../) namespace.
