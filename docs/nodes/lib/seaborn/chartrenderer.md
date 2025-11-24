---
layout: page
title: "Chart Renderer"
node_type: "lib.seaborn.ChartRenderer"
namespace: "lib.seaborn"
---

**Type:** `lib.seaborn.ChartRenderer`

**Namespace:** `lib.seaborn`

## Description

Node responsible for rendering chart configurations into image format using seaborn.
    chart, seaborn, plot, visualization, data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| chart_config | `chart_config` | The chart configuration to render. | `{'type': 'chart_config', 'title': '', 'x_label': '', 'y_label': '', 'legend': True, 'data': {'type': 'chart_data', 'series': [], 'row': None, 'col': None, 'col_wrap': None}, 'height': None, 'aspect': None, 'x_lim': None, 'y_lim': None, 'x_scale': None, 'y_scale': None, 'legend_position': 'auto', 'palette': None, 'hue_order': None, 'hue_norm': None, 'sizes': None, 'size_order': None, 'size_norm': None, 'marginal_kws': None, 'joint_kws': None, 'diag_kind': None, 'corner': False, 'center': None, 'vmin': None, 'vmax': None, 'cmap': None, 'annot': False, 'fmt': '.2g', 'square': False}` |
| width | `int` | The width of the chart in pixels. | `640` |
| height | `int` | The height of the chart in pixels. | `480` |
| data | `any` | The data to visualize as a pandas DataFrame. | - |
| despine | `bool` | Whether to remove top and right spines. | `True` |
| trim_margins | `bool` | Whether to use tight layout for margins. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.seaborn](../) namespace.

