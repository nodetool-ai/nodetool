from enum import Enum
from matplotlib import pyplot as plt
from nodetool.metadata.types import (
    ChartConfig,
    ImageRef,
    SeabornPlotType,
)
import seaborn as sns
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field

import matplotlib

matplotlib.use("Agg")
from matplotlib import pyplot as plt
import io
import pandas as pd


from typing import Any
from pydantic import Field
from nodetool.metadata.types import (
    ImageRef,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class SeabornStyle(str, Enum):
    DARKGRID = "darkgrid"
    WHITEGRID = "whitegrid"
    DARK = "dark"
    WHITE = "white"
    TICKS = "ticks"


class SeabornContext(str, Enum):
    PAPER = "paper"
    NOTEBOOK = "notebook"
    TALK = "talk"
    POSTER = "poster"


class SeabornPalette(str, Enum):
    DEEP = "deep"
    MUTED = "muted"
    PASTEL = "pastel"
    BRIGHT = "bright"
    DARK = "dark"
    COLORBLIND = "colorblind"


class SeabornFont(str, Enum):
    SANS_SERIF = "sans-serif"
    SERIF = "serif"
    MONOSPACE = "monospace"
    ARIAL = "Arial"
    HELVETICA = "Helvetica"
    TIMES = "Times New Roman"


class ChartRenderer(BaseNode):
    """
    Node responsible for rendering chart configurations into image format using seaborn.
    chart, seaborn, plot, visualization, data
    """

    chart_config: ChartConfig = Field(
        default=ChartConfig(), description="The chart configuration to render."
    )
    width: int = Field(
        default=640,
        ge=0,
        le=10000,
        description="The width of the chart in pixels.",
    )
    height: int = Field(
        default=480,
        ge=0,
        le=10000,
        description="The height of the chart in pixels.",
    )
    data: Any = Field(
        default=None, description="The data to visualize as a pandas DataFrame."
    )
    despine: bool = Field(
        default=True,
        description="Whether to remove top and right spines.",
    )
    trim_margins: bool = Field(
        default=True,
        description="Whether to use tight layout for margins.",
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.data is None:
            raise ValueError("Data is required for rendering the chart.")

        # Convert data to pandas DataFrame
        df = pd.DataFrame(
            self.data.data, columns=[col.name for col in self.data.columns]
        )

        # Clear any existing plots and set the style
        plt.clf()
        fig = plt.figure(figsize=(self.width / 100, self.height / 100), dpi=100)

        # Handle special plot types that require different figure handling
        if any(
            series.plot_type in [SeabornPlotType.JOINTPLOT, SeabornPlotType.PAIRPLOT]
            for series in self.chart_config.data.series
        ):
            # These plot types create their own figure
            series = self.chart_config.data.series[
                0
            ]  # Use first series for these plot types
            if series.plot_type == SeabornPlotType.JOINTPLOT:
                g = sns.jointplot(
                    data=df,
                    x=series.x,
                    y=series.y,
                    hue=series.hue,
                    height=self.height / 100,
                    ratio=self.chart_config.aspect or 8,
                    marginal_kws=self.chart_config.marginal_kws,
                    joint_kws=self.chart_config.joint_kws,
                )
                fig = g.figure
            elif series.plot_type == SeabornPlotType.PAIRPLOT:
                g = sns.pairplot(
                    data=df,
                    hue=series.hue,
                    diag_kind=self.chart_config.diag_kind,
                    corner=self.chart_config.corner,
                )
                fig = g.figure
        else:
            ax = fig.add_subplot(111)
            for series in self.chart_config.data.series:
                plot_kwargs = {
                    "data": df,
                    "x": series.x,
                    "y": series.y,
                    "hue": series.hue,
                    "size": series.size,
                    "style": series.style,
                    "color": series.color,
                    "alpha": series.alpha,
                    "orient": series.orient,
                    "ax": ax,
                }

                # Remove None values
                plot_kwargs = {k: v for k, v in plot_kwargs.items() if v is not None}

                # Add statistical parameters if applicable
                if series.estimator:
                    plot_kwargs["estimator"] = series.estimator
                if series.ci is not None:
                    plot_kwargs["ci"] = series.ci
                if series.stat:
                    plot_kwargs["stat"] = series.stat

                # Handle different plot types
                if series.plot_type == SeabornPlotType.SCATTER:
                    sns.scatterplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.LINE:
                    sns.lineplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.BARPLOT:
                    sns.barplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.BOXPLOT:
                    sns.boxplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.VIOLINPLOT:
                    sns.violinplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.STRIPPLOT:
                    sns.stripplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.SWARMPLOT:
                    sns.swarmplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.BOXENPLOT:
                    sns.boxenplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.POINTPLOT:
                    sns.pointplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.COUNTPLOT:
                    # Countplot doesn't use y parameter
                    plot_kwargs.pop("y", None)
                    sns.countplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.HISTPLOT:
                    plot_kwargs.update(
                        {
                            "bins": series.bins,
                            "binwidth": series.binwidth,
                            "binrange": series.binrange,
                            "discrete": series.discrete,
                        }
                    )
                    sns.histplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.KDEPLOT:
                    sns.kdeplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.ECDFPLOT:
                    sns.ecdfplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.RUGPLOT:
                    sns.rugplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.REGPLOT:
                    sns.regplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.RESIDPLOT:
                    sns.residplot(**plot_kwargs)
                elif series.plot_type == SeabornPlotType.HEATMAP:
                    # Heatmap requires different data structure
                    pivot_data = df.pivot(
                        index=series.x, columns=series.y, values=series.hue or "value"
                    )
                    sns.heatmap(
                        data=pivot_data,
                        center=self.chart_config.center,
                        vmin=self.chart_config.vmin,
                        vmax=self.chart_config.vmax,
                        cmap=self.chart_config.cmap,
                        annot=self.chart_config.annot,
                        fmt=self.chart_config.fmt,
                        square=self.chart_config.square,
                        ax=ax,
                    )
                elif series.plot_type == SeabornPlotType.CLUSTERMAP:
                    # Clustermap creates its own figure
                    pivot_data = df.pivot(
                        index=series.x, columns=series.y, values=series.hue or "value"
                    )
                    g = sns.clustermap(
                        data=pivot_data,
                        center=self.chart_config.center,
                        vmin=self.chart_config.vmin,
                        vmax=self.chart_config.vmax,
                        cmap=self.chart_config.cmap,
                        annot=self.chart_config.annot,
                        fmt=self.chart_config.fmt,
                    )
                    fig = g.figure

            # Customize plot appearance
            if self.chart_config.title:
                ax.set_title(self.chart_config.title)
            if self.chart_config.x_label:
                ax.set_xlabel(self.chart_config.x_label)
            if self.chart_config.y_label:
                ax.set_ylabel(self.chart_config.y_label)
            if self.chart_config.x_lim:
                ax.set_xlim(self.chart_config.x_lim)
            if self.chart_config.y_lim:
                ax.set_ylim(self.chart_config.y_lim)
            if self.chart_config.x_scale:
                ax.set_xscale(self.chart_config.x_scale)
            if self.chart_config.y_scale:
                ax.set_yscale(self.chart_config.y_scale)

        # When saving, get the current figure
        fig = plt.gcf()

        # Apply styling customizations
        if self.despine:
            sns.despine(fig=fig)

        if self.trim_margins:
            fig.tight_layout()

        # Convert plot to image bytes
        buf = io.BytesIO()
        fig.savefig(
            buf,
            format="png",
            bbox_inches="tight" if self.trim_margins else None,
            facecolor=fig.get_facecolor(),
            edgecolor=fig.get_edgecolor(),
            transparent=False,
        )
        plt.close(fig)

        return await context.image_from_bytes(buf.getvalue())
