---
layout: page
title: "Google Maps"
node_type: "search.google.GoogleMaps"
namespace: "search.google"
---

**Type:** `search.google.GoogleMaps`

**Namespace:** `search.google`

## Description

Search Google Maps for places, businesses, and get location details.
    google, maps, places, locations, serp, geography

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| query | `str` | Place name, address, or location query | `` |
| num_results | `int` | Maximum number of map results to return | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| results | `list[local_result]` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [search.google](../) namespace.
