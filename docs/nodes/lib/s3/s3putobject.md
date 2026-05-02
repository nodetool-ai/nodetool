---
layout: page
title: "S3 Put Object"
node_type: "lib.s3.PutObject"
namespace: "lib.s3"
---

**Type:** `lib.s3.PutObject`

**Namespace:** `lib.s3`

## Description

Uploads text content to an S3 object.
    aws, s3, put, upload, write, cloud, storage

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| bucket | `str` | S3 bucket name | `` |
| key | `str` | Object key (path) in the bucket | `` |
| body | `str` | Text content to upload | `` |
| content_type | `str` | MIME type of the content | `text/plain` |
| region | `str` | AWS region | `us-east-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |
| etag | `str` |  |

## Related Nodes

Browse other nodes in the [lib.s3](../) namespace.
