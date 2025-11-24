---
layout: page
title: "Hash File"
node_type: "lib.hashlib.HashFile"
namespace: "lib.hashlib"
---

**Type:** `lib.hashlib.HashFile`

**Namespace:** `lib.hashlib`

## Description

Compute the cryptographic hash of a file.
    hash, hashlib, digest, file

    Use cases:
    - Verify downloaded files
    - Detect file changes
    - Identify duplicates

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| file | `str` | The file to hash | `` |
| algorithm | `str` | Hash algorithm name (e.g. md5, sha1, sha256) | `md5` |
| chunk_size | `int` | Read size for hashing in bytes | `8192` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.hashlib](../) namespace.

