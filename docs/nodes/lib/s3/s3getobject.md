---
layout: page
title: "S3 Get Object"
node_type: "lib.s3.GetObject"
namespace: "lib.s3"
---

**Type:** `lib.s3.GetObject`

**Namespace:** `lib.s3`

## Description

Downloads an object's content as text from S3.
    aws, s3, get, download, read, cloud, storage

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| bucket | `str` | S3 bucket name | `` |
| key | `str` | Object key (path) in the bucket | `` |
| region | `str` | AWS region | `us-east-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| content_type | `str` |  |
| size | `int` |  |

## Related Nodes

Browse other nodes in the [lib.s3](../) namespace.
