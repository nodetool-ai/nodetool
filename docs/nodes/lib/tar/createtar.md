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
| source_folder | `any` | Folder to archive | `` |
| tar_path | `any` | Output tar file path | `` |
| gzip | `any` | Use gzip compression | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.tar](../) namespace.

