---
layout: page
title: "Generate UUID 5"
node_type: "lib.uuid.GenerateUUID5"
namespace: "lib.uuid"
---

**Type:** `lib.uuid.GenerateUUID5`

**Namespace:** `lib.uuid`

## Description

Generate a name-based UUID using SHA-1 (version 5).
    uuid, name, identifier, unique, guid, sha1, deterministic

    Use cases:
    - Create deterministic IDs from names (preferred over UUID3)
    - Generate consistent identifiers for the same input
    - Map names to unique identifiers with better collision resistance

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| namespace | `str` | Namespace (dns, url, oid, x500, or a UUID string) | `dns` |
| name | `str` | Name to generate UUID from | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.uuid](../) namespace.

