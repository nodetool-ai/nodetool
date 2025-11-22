---
layout: page
title: "List Directory"
node_type: "lib.ftplib.FTPListDirectory"
namespace: "lib.ftplib"
---

**Type:** `lib.ftplib.FTPListDirectory`

**Namespace:** `lib.ftplib`

## Description

List files in a directory on an FTP server.
    ftp, list, directory

    Use cases:
    - Browse remote directories
    - Check available files before download
    - Monitor FTP server contents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| host | `str` | FTP server host | `` |
| username | `str` | Username for authentication | `` |
| password | `str` | Password for authentication | `` |
| directory | `str` | Remote directory to list | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[str]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.ftplib](../) namespace.

