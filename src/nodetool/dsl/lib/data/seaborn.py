from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ChartRenderer(GraphNode):
    """
    Node responsible for rendering chart configurations into image format using seaborn.
    chart, seaborn, plot, visualization, data
    """

    chart_config: ChartConfig | GraphNode | tuple[GraphNode, str] = Field(default=ChartConfig(type='chart_config', title='', x_label='', y_label='', legend=True, data=ChartData(type='chart_data', series=[], row=None, col=None, col_wrap=None), height=None, aspect=None, x_lim=None, y_lim=None, x_scale=None, y_scale=None, legend_position='auto', palette=None, hue_order=None, hue_norm=None, sizes=None, size_order=None, size_norm=None, marginal_kws=None, joint_kws=None, diag_kind=None, corner=False, center=None, vmin=None, vmax=None, cmap=None, annot=False, fmt='.2g', square=False), description='The chart configuration to render.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=640, description='The width of the chart in pixels.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=480, description='The height of the chart in pixels.')
    data: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The data to visualize as a pandas DataFrame.')
    despine: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to remove top and right spines.')
    trim_margins: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to use tight layout for margins.')

    @classmethod
    def get_node_type(cls): return "lib.data.seaborn.ChartRenderer"


