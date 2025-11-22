---
layout: page
title: "Save Document File"
node_type: "nodetool.document.SaveDocumentFile"
namespace: "nodetool.document"
---

**Type:** `nodetool.document.SaveDocumentFile`

**Namespace:** `nodetool.document`

## Description

Write a document to disk.
    files, document, write, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| document | `any` | The document to save | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| folder | `any` | Folder where the file will be saved | `` |
| filename | `any` | Name of the file to save. Supports strftime format codes. | `` |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.document](../) namespace.

