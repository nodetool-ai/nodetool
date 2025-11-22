---
layout: page
title: "Download File"
node_type: "lib.ftplib.FTPDownloadFile"
namespace: "lib.ftplib"
---

**Type:** `lib.ftplib.FTPDownloadFile`

**Namespace:** `lib.ftplib`

## Description

Download a file from an FTP server.
    ftp, download, file

    Use cases:
    - Retrieve remote files for processing
    - Backup data from an FTP server
    - Integrate legacy FTP systems

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| host | `str` | FTP server host | `` |
| username | `str` | Username for authentication | `` |
| password | `str` | Password for authentication | `` |
| remote_path | `str` | Remote file path to download | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `document` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.ftplib](../) namespace.

