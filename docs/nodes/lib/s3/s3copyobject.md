---
layout: page
title: "S3 Copy Object"
node_type: "lib.s3.CopyObject"
namespace: "lib.s3"
---

**Type:** `lib.s3.CopyObject`

**Namespace:** `lib.s3`

## Description

Copies an object within or between S3 buckets.
    aws, s3, copy, duplicate, cloud, storage

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| source_bucket | `str` | Source S3 bucket name | `` |
| source_key | `str` | Source object key (path) | `` |
| dest_bucket | `str` | Destination S3 bucket name | `` |
| dest_key | `str` | Destination object key (path) | `` |
| region | `str` | AWS region | `us-east-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Related Nodes

Browse other nodes in the [lib.s3](../) namespace.
