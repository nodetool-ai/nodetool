---
layout: page
title: "S3 List Objects"
node_type: "lib.s3.ListObjects"
namespace: "lib.s3"
---

**Type:** `lib.s3.ListObjects`

**Namespace:** `lib.s3`

## Description

Lists objects in an S3 bucket with optional prefix filter.
    aws, s3, objects, list, cloud, storage, browse

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| bucket | `str` | S3 bucket name | `` |
| prefix | `str` | Optional key prefix to filter objects | `` |
| max_keys | `int` | Maximum number of objects to return | `100` |
| region | `str` | AWS region | `us-east-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| object | `dict` |  |
| objects | `list` |  |

## Related Nodes

Browse other nodes in the [lib.s3](../) namespace.
