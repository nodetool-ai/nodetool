---
layout: page
title: "S3 Delete Object"
node_type: "lib.s3.DeleteObject"
namespace: "lib.s3"
---

**Type:** `lib.s3.DeleteObject`

**Namespace:** `lib.s3`

## Description

Deletes an object from an S3 bucket.
    aws, s3, delete, remove, cloud, storage

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| bucket | `str` | S3 bucket name | `` |
| key | `str` | Object key (path) to delete | `` |
| region | `str` | AWS region | `us-east-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Related Nodes

Browse other nodes in the [lib.s3](../) namespace.
