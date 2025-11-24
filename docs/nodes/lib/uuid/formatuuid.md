---
layout: page
title: "Format UUID"
node_type: "lib.uuid.FormatUUID"
namespace: "lib.uuid"
---

**Type:** `lib.uuid.FormatUUID`

**Namespace:** `lib.uuid`

## Description

Format a UUID string in different representations.
    uuid, format, convert, hex, urn, identifier

    Use cases:
    - Convert UUID to different formats
    - Generate URN representations
    - Format UUIDs for specific use cases

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| uuid_string | `str` | UUID string to format | `` |
| format | `Enum['standard', 'hex', 'urn', 'int', 'bytes_hex']` | Output format (standard, hex, urn, int, bytes_hex) | `standard` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.uuid](../) namespace.

