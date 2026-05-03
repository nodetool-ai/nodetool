---
layout: page
title: "Chart Renderer"
node_type: "lib.charts.ChartRenderer"
namespace: "lib.charts"
---

**Type:** `lib.charts.ChartRenderer`

**Namespace:** `lib.charts`

## Description

Node responsible for rendering chart configurations into image format using seaborn.
    chart, seaborn, plot, visualization, data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| chart_config | `chart_config` | The chart configuration to render. | `{"type":"chart_config","title":"","x_label":"",...` |
| width | `int` | The width of the chart in pixels. | `640` |
| height | `int` | The height of the chart in pixels. | `480` |
| data | `dataframe` | The data to visualize as a pandas DataFrame. | `{"type":"dataframe","uri":"","asset_id":null,"d...` |
| background_color | `str` | Background color of the chart (CSS color string). | `#ffffff` |
| despine | `bool` | Whether to remove top and right spines. | `true` |
| trim_margins | `bool` | Whether to use tight layout for margins. | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [lib.charts](../) namespace.
