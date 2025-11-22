---
layout: page
title: "Save Bytes File"
node_type: "lib.bytes.SaveBytesFile"
namespace: "lib.bytes"
---

**Type:** `lib.bytes.SaveBytesFile`

**Namespace:** `lib.bytes`

## Description

Write raw bytes to a file on disk.
    files, bytes, save, output

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| data | `Optional[bytes]` | The bytes to write to file | - |
| folder | `str` | Folder where the file will be saved | `` |
| filename | `str` | Name of the file to save. Supports strftime format codes. | `` |

## Metadata

## Related Nodes

Browse other nodes in the [lib.bytes](../) namespace.

