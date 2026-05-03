---
layout: page
title: "Google Finance"
node_type: "search.google.GoogleFinance"
namespace: "search.google"
---

**Type:** `search.google.GoogleFinance`

**Namespace:** `search.google`

## Description

Retrieve financial market data and stock information from Google Finance.
    google, finance, stocks, market, serp, trading

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| query | `str` | Stock symbol or company name to search for | `` |
| window | `str` | Time window for financial data (e.g., '1d', '5d', '1m', '3m', '6m', '1y', '5y') | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| results | `dict[str, any]` |  |

## Related Nodes

Browse other nodes in the [search.google](../) namespace.
