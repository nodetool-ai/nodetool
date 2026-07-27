---
layout: page
title: "File Watch Trigger"
node_type: "nodetool.triggers.FileWatchTrigger"
namespace: "nodetool.triggers"
---

**Type:** `nodetool.triggers.FileWatchTrigger`

**Namespace:** `nodetool.triggers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| max_events | `int` | File events to emit before the node stops (0 = unlimited). Applies only while the node runs in the editor; the file-watch adapter keeps firing an activated trigger regardless. | `0` |
| path | `str` | Path to watch (file or directory) | `.` |
| recursive | `bool` | Watch subdirectories recursively | `false` |
| patterns | `list[str]` | File patterns to watch (e.g., ['*.txt', '*.json']) | `["*"]` |
| ignore_patterns | `list[str]` | File patterns to ignore | `[]` |
| events | `list[str]` | Types of events to watch for | `["created","modified","deleted","moved"]` |
| debounce_seconds | `float` | Debounce time to avoid duplicate events | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| event | `str` |  |
| path | `str` |  |
| dest_path | `str` |  |
| is_directory | `bool` |  |
| timestamp | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.triggers](./) namespace.
