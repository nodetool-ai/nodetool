---
layout: page
title: "GraphQL Query with Auth"
node_type: "lib.graphql.QueryWithAuth"
namespace: "lib.graphql"
---

**Type:** `lib.graphql.QueryWithAuth`

**Namespace:** `lib.graphql`

## Description

Execute a GraphQL query or mutation with Bearer token authentication.
    graphql, query, mutation, api, auth, bearer, token

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| url | `str` | GraphQL API endpoint URL | `` |
| query | `str` | GraphQL query or mutation string | `` |
| variables | `str` | Optional JSON object of query variables | `` |
| headers | `str` | Optional JSON object of additional HTTP headers | `` |
| operation_name | `str` | Optional operation name for multi-operation documents | `` |
| auth_token | `str` | Bearer token, falls back to GRAPHQL_AUTH_TOKEN secret | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| data | `any` |  |
| errors | `list` |  |
| status | `int` |  |

## Related Nodes

Browse other nodes in the [lib.graphql](../) namespace.
