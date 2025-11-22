---
layout: page
title: "Download Files"
node_type: "lib.http.DownloadFiles"
namespace: "lib.http"
---

**Type:** `lib.http.DownloadFiles`

**Namespace:** `lib.http`

## Description

Download files from a list of URLs into a local folder.
    download, files, urls, batch

    Use cases:
    - Batch download files from multiple URLs
    - Create local copies of remote resources
    - Archive web content
    - Download datasets

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| urls | `any` | List of URLs to download. | `[]` |
| output_folder | `any` | Local folder path where files will be saved. | `downloads` |
| max_concurrent_downloads | `any` | Maximum number of concurrent downloads. | `5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| success | `any` |  |
| failed | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.http](../) namespace.

