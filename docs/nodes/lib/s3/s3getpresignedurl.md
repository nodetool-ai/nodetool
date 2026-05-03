---
layout: page
title: "S3 Get Presigned URL"
node_type: "lib.s3.GetPresignedUrl"
namespace: "lib.s3"
---

**Type:** `lib.s3.GetPresignedUrl`

**Namespace:** `lib.s3`

## Description

Generates a presigned URL for temporary access to an S3 object.
    aws, s3, presigned, url, share, cloud, storage

    Note: Requires @aws-sdk/s3-request-presigner. If unavailable, falls back to constructing an unsigned URL.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| bucket | `str` | S3 bucket name | `` |
| key | `str` | Object key (path) in the bucket | `` |
| expires_in | `int` | Expiry time in seconds | `3600` |
| region | `str` | AWS region | `us-east-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [lib.s3](../) namespace.
