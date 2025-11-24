---
layout: page
title: "Hash String"
node_type: "lib.hashlib.HashString"
namespace: "lib.hashlib"
---

**Type:** `lib.hashlib.HashString`

**Namespace:** `lib.hashlib`

## Description

Compute the cryptographic hash of a string using hashlib.
    hash, hashlib, digest, string

    Use cases:
    - Generate deterministic identifiers
    - Verify data integrity
    - Create fingerprints for caching

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` | The text to hash | `` |
| algorithm | `str` | Hash algorithm name (e.g. md5, sha1, sha256) | `md5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.hashlib](../) namespace.

