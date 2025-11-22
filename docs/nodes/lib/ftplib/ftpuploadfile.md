---
layout: page
title: "Upload File"
node_type: "lib.ftplib.FTPUploadFile"
namespace: "lib.ftplib"
---

**Type:** `lib.ftplib.FTPUploadFile`

**Namespace:** `lib.ftplib`

## Description

Upload a file to an FTP server.
    ftp, upload, file

    Use cases:
    - Transfer files to an FTP server
    - Automate backups to a remote system
    - Integrate with legacy FTP workflows

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| host | `str` | FTP server host | `` |
| username | `str` | Username for authentication | `` |
| password | `str` | Password for authentication | `` |
| remote_path | `str` | Remote file path to upload to | `` |
| document | `document` | Document to upload | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `none` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.ftplib](../) namespace.

