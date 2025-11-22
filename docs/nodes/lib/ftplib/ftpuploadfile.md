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
| host | `any` | FTP server host | `` |
| username | `any` | Username for authentication | `` |
| password | `any` | Password for authentication | `` |
| remote_path | `any` | Remote file path to upload to | `` |
| document | `any` | Document to upload | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.ftplib](../) namespace.

