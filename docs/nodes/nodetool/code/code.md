---
layout: page
title: "Code"
node_type: "nodetool.code.Code"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.Code`

**Namespace:** `nodetool.code`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| code | `str` |  | `return {};` |
| packages | `list[dict]` |  | `[]` |
| secrets | `list[str]` |  | `[]` |
| script | `dict` |  | `{}` |
| timeout | `int` | Max seconds before execution is aborted (0 = no limit). | `30` |
| max_response_mb | `int` | Megabytes of response body a single fetch() may read before it is aborted. | `1` |
| allow_local_network | `bool` |  | `false` |
| allow_host_filesystem | `bool` |  | `false` |

## Outputs

_(none)_

## Related Nodes

Browse other nodes in the [nodetool.code](./) namespace.
