---
layout: page
title: "Create Tar"
node_type: "lib.tar.CreateTar"
namespace: "lib.tar"
---

**Type:** `lib.tar.CreateTar`

**Namespace:** `lib.tar`

## Description

Create a tar archive from a directory.
    files, tar, create

    Use cases:
    - Package multiple files into a single archive
    - Backup directories
    - Prepare archives for distribution

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| source_folder | `str` | Folder to archive | `` |
| tar_path | `str` | Output tar file path | `` |
| gzip | `bool` | Use gzip compression | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.tar](../) namespace.

