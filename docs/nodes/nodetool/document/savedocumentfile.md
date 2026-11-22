---
layout: page
title: "Save Document File"
node_type: "nodetool.document.SaveDocumentFile"
namespace: "nodetool.document"
---

**Type:** `nodetool.document.SaveDocumentFile`

**Namespace:** `nodetool.document`

## Description

Write a document to disk, or into a project document.
    files, document, write, output, save, file, markdown

    With a target document, the content replaces or is appended to that document, and each run keeps the content before it as a version. Without a target the node writes folder plus filename.

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| document | `document` | The document to save | `{"type":"document","uri":"","asset_id":null,"da...` |
| text | `str` | Markdown text to save. Used instead of the document input when it is not empty. | `` |
| target | `document` | A project document to write into. Leave empty to write a new file to folder plus filename. | `{"type":"document","uri":"","asset_id":null,"da...` |
| mode | `enum` | Replace the target document's content, or append to it. | `replace` |
| save_to_workspace | `bool` |  | `true` |
| folder | `str` | Folder where the file will be saved | `` |
| filename | `str` | Name of the file to save. Supports strftime format codes. | `` |

## Outputs

_(none)_

## Related Nodes

Browse other nodes in the [nodetool.document](./) namespace.
