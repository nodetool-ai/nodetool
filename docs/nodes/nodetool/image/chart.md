# nodetool.nodes.nodetool.image.chart

## ChartRenderer

Node responsible for rendering chart configurations into image format using seaborn.

**Fields:**
- **chart_config**: The chart configuration to render. (ChartConfig)
- **width**: The width of the chart in pixels. (int)
- **height**: The height of the chart in pixels. (int)
- **data**: The data to visualize as a pandas DataFrame. (Any)
- **style**: The style of the plot background and grid. (SeabornStyle)
- **context**: The context of the plot, affecting scale and aesthetics. (SeabornContext)
- **palette**: Color palette for the plot. (SeabornPalette)
- **font_scale**: Scale factor for font sizes. (float)
- **font**: Font family for text elements. (SeabornFont)
- **despine**: Whether to remove top and right spines. (bool)
- **trim_margins**: Whether to use tight layout for margins. (bool)


## SeabornContext

## SeabornFont

## SeabornPalette

## SeabornStyle

