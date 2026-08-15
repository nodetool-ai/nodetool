---
layout: page
title: "Google Drive Create File"
node_type: "lib.google.DriveCreateFile"
namespace: "lib.google"
---

**Type:** `lib.google.DriveCreateFile`

**Namespace:** `lib.google`

## Description

Create a text file in the signed-in user's Google Drive.
    google, drive, create, upload, file

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | File name | `` |
| content | `str` | File contents | `` |
| mime_type | `str` | MIME type of the uploaded content | `text/plain` |
| folder_id | `str` | Parent folder id (blank for My Drive root) | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.google](./) namespace.
