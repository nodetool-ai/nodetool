---
layout: page
title: "Plot Array"
node_type: "lib.array.visualization.PlotArray"
namespace: "lib.array.visualization"
---

**Type:** `lib.array.visualization.PlotArray`

**Namespace:** `lib.array.visualization`

## Description

Create a plot visualization of array data.
    array, plot, visualization, graph

    Use cases:
    - Visualize trends in array data
    - Create charts for reports or dashboards
    - Debug array outputs in workflows

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | Array to plot | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| plot_type | `Enum['line', 'bar', 'scatter']` | Type of plot to create | `line` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.array.visualization](../) namespace.

