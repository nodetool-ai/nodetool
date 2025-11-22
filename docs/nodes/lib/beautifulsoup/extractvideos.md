---
layout: page
title: "Extract Videos"
node_type: "lib.beautifulsoup.ExtractVideos"
namespace: "lib.beautifulsoup"
---

**Type:** `lib.beautifulsoup.ExtractVideos`

**Namespace:** `lib.beautifulsoup`

## Description

Extract videos from HTML content.
    extract, videos, src

    Use cases:
    - Collect video sources from web pages
    - Analyze video usage on websites
    - Create video playlists

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| html | `str` | The HTML content to extract videos from. | `` |
| base_url | `str` | The base URL of the page, used to resolve relative video URLs. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| video | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.beautifulsoup](../) namespace.

