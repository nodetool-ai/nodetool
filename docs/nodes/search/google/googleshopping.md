---
layout: page
title: "Google Shopping"
node_type: "search.google.GoogleShopping"
namespace: "search.google"
---

**Type:** `search.google.GoogleShopping`

**Namespace:** `search.google`

## Description

Search Google Shopping for products.
    google, shopping, products, ecommerce, serp

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| query | `str` | Product name or description to search for | `` |
| country | `str` | Country code for shopping search (e.g., 'us', 'uk', 'ca') | `us` |
| min_price | `int` | Minimum price filter for products | `0` |
| max_price | `int` | Maximum price filter for products | `0` |
| condition | `str` | Product condition filter (e.g., 'new', 'used', 'refurbished') | `` |
| sort_by | `str` | Sort order for results (e.g., 'price_low_to_high', 'price_high_to_low', 'review_score') | `` |
| num_results | `int` | Maximum number of shopping results to return | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[shopping_result]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [search.google](../) namespace.

