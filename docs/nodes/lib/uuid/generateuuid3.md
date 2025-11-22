---
layout: page
title: "Generate UUID 3"
node_type: "lib.uuid.GenerateUUID3"
namespace: "lib.uuid"
---

**Type:** `lib.uuid.GenerateUUID3`

**Namespace:** `lib.uuid`

## Description

Generate a name-based UUID using MD5 (version 3).
    uuid, name, identifier, unique, guid, md5, deterministic

    Use cases:
    - Create deterministic IDs from names
    - Generate consistent identifiers for the same input
    - Map names to unique identifiers

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| namespace | `any` | Namespace (dns, url, oid, x500, or a UUID string) | `dns` |
| name | `any` | Name to generate UUID from | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.uuid](../) namespace.

