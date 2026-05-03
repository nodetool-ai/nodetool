---
layout: page
title: "Remove Punctuation"
node_type: "nodetool.text.RemovePunctuation"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.RemovePunctuation`

**Namespace:** `nodetool.text`

## Description

Removes punctuation characters from text.
    text, cleanup, punctuation, normalize

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` |  | `` |
| replacement | `str` | String to insert where punctuation was removed | `` |
| punctuation | `str` | Characters that should be removed or replaced | `!"#$%&'()*+,-./:;<=>?@[\\]^_`{\|}~` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
