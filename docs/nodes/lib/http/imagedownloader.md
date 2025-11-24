---
layout: page
title: "Image Downloader"
node_type: "lib.http.ImageDownloader"
namespace: "lib.http"
---

**Type:** `lib.http.ImageDownloader`

**Namespace:** `lib.http`

## Description

Download images from list of URLs and return a list of ImageRefs.
    image download, web scraping, data processing

    Use cases:
    - Prepare image datasets for machine learning tasks
    - Archive images from web pages
    - Process and analyze images extracted from websites

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| images | `List[str]` | List of image URLs to download. | `[]` |
| base_url | `str` | Base URL to prepend to relative image URLs. | `` |
| max_concurrent_downloads | `int` | Maximum number of concurrent image downloads. | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| images | `List[image]` |  |
| failed_urls | `List[str]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

