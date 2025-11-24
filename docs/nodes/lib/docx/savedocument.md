---
layout: page
title: "Save Document"
node_type: "lib.docx.SaveDocument"
namespace: "lib.docx"
---

**Type:** `lib.docx.SaveDocument`

**Namespace:** `lib.docx`

## Description

Writes the document to a file
    document, docx, file, save, output

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| document | `document` | The document to write | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| path | `file_path` | The folder to write the document to. | `{'type': 'file_path', 'path': ''}` |
| filename | `str` | 
        The filename to write the document to.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `` |

## Metadata

## Related Nodes

Browse other nodes in the [lib.docx](../) namespace.

