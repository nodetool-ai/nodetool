---
layout: page
title: "Google Drive Search"
node_type: "lib.google.DriveSearch"
namespace: "lib.google"
---

**Type:** `lib.google.DriveSearch`

**Namespace:** `lib.google`

## Description

Search files in the signed-in user's Google Drive.
    google, drive, search, files, cloud

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| query | `str` | Search phrase, or Drive query syntax such as "name contains 'report'" | `` |
| max_results | `int` | Maximum number of files to return | `20` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |
| outputs | `list` |  |

## Related Nodes

Browse other nodes in the [lib.google](./) namespace.
