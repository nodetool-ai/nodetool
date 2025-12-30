---
layout: page
title: "nodetool.output Nodes"
---


This namespace contains the Output node for returning results from workflows.

## Available Nodes

- **[Output](output.md)** - Generic output node that handles all data types (text, images, audio, video, etc.).
    output, result, return, workflow, any, generic

## Usage

The `Output` node is a unified output node that automatically adapts to the type of data connected to it. Simply connect any node's output to the Output node's input, and it will handle the data appropriately.

### Example

```
ImageInput → ImageProcessing → Output
```

The Output node replaces the previous type-specific output nodes (StringOutput, ImageOutput, etc.) with a single, flexible node that works with all data types.

## Related Namespaces

- [nodetool.input](../input/) - Input nodes for accepting workflow parameters
- [nodetool.constant](../constant/) - Constant value nodes
