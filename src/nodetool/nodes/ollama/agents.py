import json
from ollama import ChatResponse
import pandas as pd
import statsmodels.api as sm


from pydantic import Field
from nodetool.chat.chat import json_schema_for_dataframe
from nodetool.metadata.types import (
    ChartConfig,
    ChartConfigSchema,
    ChartData,
    DataSeries,
    DataframeRef,
    JSONRef,
    LlamaModel,
    Provider,
    RecordType,
    SVGElement,
    SeabornPlotType,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


from nodetool.metadata.types import LlamaModel
from nodetool.workflows.base_node import BaseNode
from pydantic import Field

import tiktoken
from typing import List

from nodetool.workflows.types import NodeProgress


def split_text_into_chunks(
    text: str, chunk_size: int, overlap: int, encoding_name: str = "cl100k_base"
) -> List[str]:
    """
    Split text into chunks with overlap.

    Use cases:
    - Summarizing long texts
    - Splitting text for processing in chunks
    - Creating training data for models

    Args:
        text: The text to split into chunks.
        chunk_size: The size of each chunk.
        overlap: The number of tokens to overlap between chunks.
        encoding_name: The name of the encoding to use.

    Returns:
        A list of chunks of text.
    """
    # Initialize the tokenizer with the specified encoding
    encoding = tiktoken.get_encoding(encoding_name)

    # Encode the text into tokens
    tokens = encoding.encode(text)

    # Calculate the step size by subtracting the overlap from the chunk size
    step_size = chunk_size - overlap

    # Split tokens into chunks with the specified overlap
    token_chunks = [
        tokens[i : i + chunk_size] for i in range(0, len(tokens), step_size)
    ]

    # Decode each chunk back into text
    text_chunks = [encoding.decode(chunk) for chunk in token_chunks]

    return text_chunks


class DataGenerator(BaseNode):
    """
    LLM Agent to create a dataframe based on a user prompt.
    llm, dataframe creation, data structuring

    Use cases:
    - Generating structured data from natural language descriptions
    - Creating sample datasets for testing or demonstration
    - Converting unstructured text into tabular format
    """

    model: LlamaModel = Field(
        default=LlamaModel(), description="The Llama model to use."
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096 * 2,
        description="The context window size to use for the model.",
    )
    prompt: str = Field(
        default="",
        description="The user prompt",
    )
    temperature: float = Field(
        default=1.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    top_k: int = Field(
        default=50,
        ge=1,
        le=100,
        description="The number of highest probability tokens to keep for top-k sampling.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )
    keep_alive: int = Field(
        default=300,
        description="The number of seconds to keep the model alive.",
    )
    columns: RecordType = Field(
        default=RecordType(),
        description="The columns to use in the dataframe.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "prompt", "columns"]

    async def process(self, context: ProcessingContext) -> DataframeRef:
        columns_str = ", ".join(
            [
                f"{col.name}: {col.data_type} ({col.description})"
                for col in self.columns.columns
            ]
        )

        def example_value_for_type(data_type: str) -> str:
            if data_type == "string":
                return "example"
            elif data_type == "int":
                return "123"
            elif data_type == "float":
                return "123.45"
            elif data_type == "datetime":
                return "2024-01-01"
            elif data_type == "object":
                return "{}"
            else:
                return ""

        example_row = {
            col.name: example_value_for_type(col.data_type)
            for col in self.columns.columns
        }

        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": f"""
                        You are an assistant that returns a dataframe in json format.
                        """,
                    },
                    {"role": "user", "content": self.prompt + ". Return as JSON."},
                ],
                "format": json_schema_for_dataframe(self.columns.columns),
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "num_predict": 4096,
                    "num_ctx": self.context_window,
                },
            },
        )
        content = str(res["message"]["content"])

        # find the first [ and the last ]
        start = content.find("[")
        end = content.rfind("]")

        if start == -1 or end == -1:
            raise ValueError(
                f"No valid JSON data found in the response: {content[:1000]}"
            )

        content = content[start : end + 1]

        data = [
            [
                (row[col.name] if col.name in row else None)
                for col in self.columns.columns
            ]
            for row in json.loads(str(content))
        ]
        return DataframeRef(columns=self.columns.columns, data=data)


SVG_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "elements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "enum": [
                            "circle",
                            "rect",
                            "path",
                            "text",
                            "line",
                            "polyline",
                            "polygon",
                            "ellipse",
                            "g",
                            "svg",
                            "defs",
                            "use",
                            "symbol",
                            "clipPath",
                            "mask",
                            "pattern",
                            "image",
                            "foreignObject",
                            "marker",
                            "linearGradient",
                            "radialGradient",
                            "stop",
                            "filter",
                            "feBlend",
                            "feColorMatrix",
                            "feComponentTransfer",
                            "feComposite",
                            "feConvolveMatrix",
                            "feDiffuseLighting",
                            "feDisplacementMap",
                            "feFlood",
                            "feGaussianBlur",
                            "feImage",
                            "feMerge",
                            "feMorphology",
                            "feOffset",
                            "feSpecularLighting",
                            "feTile",
                            "feTurbulence",
                            "animate",
                            "animateMotion",
                            "animateTransform",
                            "set",
                            "desc",
                            "metadata",
                            "title",
                            "switch",
                            "tspan",
                            "textPath",
                        ],
                        "description": "SVG tag name",
                    },
                    "attributes": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "class": {"type": "string"},
                            "fill": {"type": "string"},
                            "stroke": {"type": "string"},
                            "stroke-width": {"type": "string"},
                            "x": {"type": "string"},
                            "y": {"type": "string"},
                            "width": {"type": "string"},
                            "height": {"type": "string"},
                            "cx": {"type": "string"},
                            "cy": {"type": "string"},
                            "r": {"type": "string"},
                            "d": {"type": "string"},
                            "transform": {"type": "string"},
                            "style": {"type": "string"},
                            "opacity": {"type": "string"},
                        },
                        "additionalProperties": False,
                    },
                    "content": {
                        "type": "string",
                        "description": "Text content for text elements",
                    },
                    "children": {
                        "type": "array",
                        "items": {"$ref": "#/properties/elements/items"},
                        "description": "Nested SVG elements",
                    },
                },
                "required": ["name", "attributes"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["elements"],
}


class SVGGenerator(BaseNode):
    """
    LLM Agent to create SVG elements based on a user prompt.
    llm, svg generation, vector graphics

    Use cases:
    - Generating SVG graphics from natural language descriptions
    - Creating vector illustrations programmatically
    - Converting text descriptions into visual elements
    """

    @classmethod
    def get_title(cls) -> str:
        return "SVG Generator"

    model: LlamaModel = Field(
        default=LlamaModel(), description="The Llama model to use."
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096 * 2,
        description="The context window size to use for the model.",
    )
    prompt: str = Field(
        default="",
        description="The user prompt for SVG generation",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    top_k: int = Field(
        default=50,
        ge=1,
        le=100,
        description="The number of highest probability tokens to keep for top-k sampling.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )
    keep_alive: int = Field(
        default=300,
        description="The number of seconds to keep the model alive.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "prompt"]

    async def process(self, context: ProcessingContext) -> list[SVGElement]:
        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": f"""
                        You are an assistant that creates SVG elements in JSON format.
                        """,
                    },
                    {"role": "user", "content": self.prompt + ". Respond using JSON."},
                ],
                "format": SVG_JSON_SCHEMA,
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "num_predict": 4096,
                    "num_ctx": self.context_window,
                },
            },
        )
        content = str(res["message"]["content"])
        print(content)

        # Extract JSON content
        start = content.find("{")
        end = content.rfind("}")

        if start == -1 or end == -1:
            raise ValueError(
                f"No valid JSON data found in the response: {content[:1000]}"
            )

        content = content[start : end + 1]
        data = json.loads(content)

        # Convert JSON to SVGElement objects
        def create_svg_element(element_data: dict) -> SVGElement:
            children = [
                create_svg_element(child) for child in element_data.get("children", [])
            ]
            return SVGElement(
                name=element_data["name"],
                attributes=element_data["attributes"],
                content=element_data.get("content", ""),
                children=children,
            )

        return [create_svg_element(elem) for elem in data["elements"]]


EXAMPLE_CHARTS = {
    SeabornPlotType.LINE: {
        "title": "Monthly Sales Trends with Confidence Bands",
        "x_label": "Month",
        "y_label": "Sales ($)",
        "legend": True,
        "legend_position": "right",
        "data": {
            "series": [
                {
                    "name": "Revenue",
                    "x": "month",
                    "y": "revenue",
                    "plot_type": "line",
                    "color": "#2196F3",
                    "marker": "o",
                    "ci": 95,
                    "alpha": 0.8,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.SCATTER: {
        "title": "Price vs. Rating by Category",
        "x_label": "Price ($)",
        "y_label": "Customer Rating",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Products",
                    "x": "price",
                    "y": "rating",
                    "plot_type": "scatter",
                    "hue": "category",
                    "style": "category",
                    "alpha": 0.6,
                    "size": 5,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
        "palette": "husl",
    },
    SeabornPlotType.BOXPLOT: {
        "title": "Product Performance by Region",
        "x_label": "Region",
        "y_label": "Performance",
        "legend": True,
        "legend_position": "right",
        "data": {
            "series": [
                {
                    "name": "Performance",
                    "x": "region",
                    "y": "performance",
                    "plot_type": "boxplot",
                    "hue": "category",
                    "dodge": True,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
        "palette": "deep",
    },
    SeabornPlotType.VIOLINPLOT: {
        "title": "Distribution by Category",
        "x_label": "Category",
        "y_label": "Value",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Distribution",
                    "x": "category",
                    "y": "value",
                    "plot_type": "violin",
                    "inner": "box",
                    "split": False,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
        "palette": "Set2",
    },
    SeabornPlotType.HEATMAP: {
        "title": "Feature Correlation Matrix",
        "x_label": "Features",
        "y_label": "Features",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Correlations",
                    "plot_type": "heatmap",
                    "mask_upper": True,
                    "center": 0,
                }
            ]
        },
        "cmap": "vlag",
        "annot": True,
        "fmt": ".2f",
        "square": True,
        "height": 8,
        "aspect": 1,
    },
    SeabornPlotType.HISTPLOT: {
        "title": "Value Distribution",
        "x_label": "Value",
        "y_label": "Count",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Distribution",
                    "x": "value",
                    "plot_type": "histogram",
                    "bins": 30,
                    "kde": True,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
        "palette": "deep",
    },
    SeabornPlotType.BARPLOT: {
        "title": "Sales by Category",
        "x_label": "Category",
        "y_label": "Sales ($)",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Sales",
                    "x": "category",
                    "y": "sales",
                    "plot_type": "barplot",
                    "hue": "region",
                    "ci": 95,
                    "estimator": "mean",
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
        "palette": "deep",
    },
    SeabornPlotType.COUNTPLOT: {
        "title": "Distribution of Categories",
        "x_label": "Category",
        "y_label": "Count",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Counts",
                    "x": "category",
                    "plot_type": "countplot",
                    "hue": "subcategory",
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.POINTPLOT: {
        "title": "Average Scores by Group",
        "x_label": "Group",
        "y_label": "Score",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Scores",
                    "x": "group",
                    "y": "score",
                    "plot_type": "pointplot",
                    "hue": "subgroup",
                    "ci": 95,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.REGPLOT: {
        "title": "Relationship between Variables",
        "x_label": "X Variable",
        "y_label": "Y Variable",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Regression",
                    "x": "x_var",
                    "y": "y_var",
                    "plot_type": "regplot",
                    "scatter": True,
                    "ci": 95,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.KDEPLOT: {
        "title": "Distribution Analysis",
        "x_label": "Value",
        "y_label": "Density",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Distribution",
                    "x": "value",
                    "plot_type": "kdeplot",
                    "hue": "category",
                    "multiple": "layer",
                    "fill": True,
                    "alpha": 0.5,
                    "bw_adjust": 1.0,
                    "cut": 3,
                    "cumulative": False,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
        "palette": "deep",
    },
    SeabornPlotType.SWARMPLOT: {
        "title": "Value Distribution by Category",
        "x_label": "Category",
        "y_label": "Value",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Values",
                    "x": "category",
                    "y": "value",
                    "plot_type": "swarmplot",
                    "hue": "group",
                    "size": 5,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.STRIPPLOT: {
        "title": "Raw Data by Category",
        "x_label": "Category",
        "y_label": "Value",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Values",
                    "x": "category",
                    "y": "value",
                    "plot_type": "stripplot",
                    "hue": "group",
                    "jitter": True,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.JOINTPLOT: {
        "title": "Joint Distribution",
        "x_label": "X Variable",
        "y_label": "Y Variable",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Distribution",
                    "x": "x_var",
                    "y": "y_var",
                    "plot_type": "jointplot",
                    "kind": "scatter",
                }
            ]
        },
        "height": 8,
        "ratio": 8,
    },
    SeabornPlotType.PAIRPLOT: {
        "title": "Pairwise Relationships",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Pairs",
                    "vars": ["var1", "var2", "var3"],
                    "plot_type": "pairplot",
                    "hue": "category",
                    "diag_kind": "kde",
                }
            ]
        },
        "height": 2.5,
        "aspect": 1,
    },
    SeabornPlotType.RELPLOT: {
        "title": "Relationship Plot",
        "x_label": "X Variable",
        "y_label": "Y Variable",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Relationship",
                    "x": "x_var",
                    "y": "y_var",
                    "plot_type": "relplot",
                    "hue": "category",
                    "size": "value",
                    "style": "group",
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.ECDFPLOT: {
        "title": "Empirical Cumulative Distribution",
        "x_label": "Value",
        "y_label": "Cumulative Probability",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "ECDF",
                    "x": "value",
                    "plot_type": "ecdfplot",
                    "hue": "group",
                    "stat": "proportion",
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.RUGPLOT: {
        "title": "Distribution Rug Plot",
        "x_label": "Value",
        "y_label": "Density",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Distribution",
                    "x": "value",
                    "plot_type": "rugplot",
                    "height": 0.05,
                    "expand_margins": True,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.DISTPLOT: {
        "title": "Distribution Plot",
        "x_label": "Value",
        "y_label": "Density",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Distribution",
                    "x": "value",
                    "plot_type": "distplot",
                    "kde": True,
                    "rug": True,
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.BOXENPLOT: {
        "title": "Enhanced Box Plot",
        "x_label": "Category",
        "y_label": "Value",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Distribution",
                    "x": "category",
                    "y": "value",
                    "plot_type": "boxenplot",
                    "hue": "group",
                    "scale": "area",
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.LMPLOT: {
        "title": "Linear Model Plot",
        "x_label": "X Variable",
        "y_label": "Y Variable",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Model",
                    "x": "x_var",
                    "y": "y_var",
                    "plot_type": "lmplot",
                    "hue": "group",
                    "col": "category",
                    "row": "subset",
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.RESIDPLOT: {
        "title": "Residual Plot",
        "x_label": "Fitted Values",
        "y_label": "Residuals",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Residuals",
                    "x": "fitted",
                    "y": "residuals",
                    "plot_type": "residplot",
                    "lowess": True,
                    "scatter_kws": {"alpha": 0.5},
                }
            ]
        },
        "height": 6,
        "aspect": 1.5,
    },
    SeabornPlotType.CLUSTERMAP: {
        "title": "Clustered Heatmap",
        "x_label": "Features",
        "y_label": "Samples",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Clusters",
                    "plot_type": "clustermap",
                    "cmap": "vlag",
                    "center": 0,
                    "standard_scale": 1,
                }
            ]
        },
        "height": 10,
        "aspect": 1,
    },
    SeabornPlotType.FACETGRID: {
        "title": "Faceted Plot Grid",
        "x_label": "X Variable",
        "y_label": "Y Variable",
        "legend": True,
        "data": {
            "series": [
                {
                    "name": "Facets",
                    "x": "x_var",
                    "y": "y_var",
                    "plot_type": "facetgrid",
                    "row": "category",
                    "col": "group",
                    "hue": "subgroup",
                }
            ]
        },
        "height": 3,
        "aspect": 1.5,
    },
}

PLOT_TYPE_SCHEMAS = {
    SeabornPlotType.LINE: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["line"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "color": {"type": "string", "nullable": True},
                                "marker": {"type": "string", "nullable": True},
                                "ci": {"type": "integer", "nullable": True},
                                "alpha": {"type": "number", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.SCATTER: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["scatter"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "style": {"type": "string", "nullable": True},
                                "alpha": {"type": "number", "nullable": True},
                                "size": {"type": "integer", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.BOXPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["boxplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "dodge": {"type": "boolean", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.VIOLINPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["violin"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "inner": {
                                    "type": "string",
                                    "enum": [
                                        "box",
                                        "quartile",
                                        "point",
                                        "stick",
                                        "None",
                                    ],
                                    "nullable": True,
                                },
                                "split": {"type": "boolean", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.HEATMAP: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["heatmap"]},
                                "name": {"type": "string"},
                                "mask_upper": {"type": "boolean", "nullable": True},
                                "center": {"type": "number", "nullable": True},
                            },
                            "required": ["plot_type", "name"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.HISTPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["histogram"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "bins": {"type": "integer", "nullable": True},
                                "kde": {"type": "boolean", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.BARPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["barplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "ci": {"type": "integer", "nullable": True},
                                "estimator": {
                                    "type": "string",
                                    "enum": [
                                        "mean",
                                        "median",
                                        "sum",
                                        "count",
                                        "min",
                                        "max",
                                        "var",
                                        "std",
                                    ],
                                    "nullable": True,
                                },
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.COUNTPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["countplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.POINTPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["pointplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "ci": {"type": "integer", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.REGPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["regplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "scatter": {"type": "boolean", "nullable": True},
                                "ci": {"type": "integer", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.KDEPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["kdeplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string", "nullable": True},
                                "hue": {"type": "string", "nullable": True},
                                "multiple": {
                                    "type": "string",
                                    "enum": ["layer", "stack", "fill"],
                                    "nullable": True,
                                },
                                "fill": {"type": "boolean", "nullable": True},
                                "alpha": {"type": "number", "nullable": True},
                                "bw_adjust": {"type": "number", "nullable": True},
                                "cut": {"type": "number", "nullable": True},
                                "cumulative": {"type": "boolean", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.SWARMPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["swarmplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "size": {"type": "integer", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.STRIPPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["stripplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "jitter": {"type": "boolean", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.JOINTPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["jointplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "kind": {
                                    "type": "string",
                                    "enum": ["scatter", "reg", "resid", "kde", "hex"],
                                    "nullable": True,
                                },
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.PAIRPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["pairplot"]},
                                "name": {"type": "string"},
                                "vars": {"type": "array", "items": {"type": "string"}},
                                "hue": {"type": "string", "nullable": True},
                                "diag_kind": {
                                    "type": "string",
                                    "enum": ["auto", "hist", "kde"],
                                    "nullable": True,
                                },
                            },
                            "required": ["plot_type", "name", "vars"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "data"],
    },
    SeabornPlotType.RELPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["relplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "size": {"type": "string", "nullable": True},
                                "style": {"type": "string", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.ECDFPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["ecdfplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "stat": {
                                    "type": "string",
                                    "enum": ["proportion", "count", "percent"],
                                    "nullable": True,
                                },
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.RUGPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["rugplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "height": {"type": "number", "nullable": True},
                                "expand_margins": {"type": "boolean", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.DISTPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["distplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "kde": {"type": "boolean", "nullable": True},
                                "rug": {"type": "boolean", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.BOXENPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["boxenplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "scale": {"type": "string", "nullable": True},
                                "scale_type": {
                                    "type": "string",
                                    "enum": ["area", "count", "proportion"],
                                },
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.LMPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["lmplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "col": {"type": "string", "nullable": True},
                                "row": {"type": "string", "nullable": True},
                                "hue_order": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "size": {"type": "string", "nullable": True},
                                "size_order": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "size_norm": {
                                    "type": "array",
                                    "items": {"type": "number"},
                                },
                                "x_estimator": {
                                    "type": "string",
                                    "enum": ["mean", "median", "std"],
                                },
                                "y_estimator": {
                                    "type": "string",
                                    "enum": ["mean", "median", "std"],
                                },
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.RESIDPLOT: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["residplot"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "hue": {"type": "string", "nullable": True},
                                "lowess": {"type": "boolean", "nullable": True},
                                "scatter_kws": {"type": "object", "nullable": True},
                                "line_kws": {
                                    "type": "object",
                                    "properties": {
                                        "color": {"type": "string", "nullable": True}
                                    },
                                },
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.CLUSTERMAP: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["clustermap"]},
                                "name": {"type": "string"},
                                "cmap": {"type": "string", "nullable": True},
                                "center": {"type": "number", "nullable": True},
                                "standard_scale": {"type": "integer", "nullable": True},
                                "method": {
                                    "type": "string",
                                    "enum": [
                                        "single",
                                        "complete",
                                        "average",
                                        "weighted",
                                        "centroid",
                                        "median",
                                        "ward",
                                    ],
                                    "nullable": True,
                                },
                                "metric": {
                                    "type": "string",
                                    "enum": [
                                        "euclidean",
                                        "correlation",
                                        "manhattan",
                                        "cosine",
                                    ],
                                    "nullable": True,
                                },
                                "z_score": {"type": "boolean", "nullable": True},
                                "figsize": {
                                    "type": "array",
                                    "items": {"type": "number"},
                                    "nullable": True,
                                },
                                "row_cluster": {"type": "boolean", "nullable": True},
                                "col_cluster": {"type": "boolean", "nullable": True},
                                "row_linkage": {
                                    "type": "array",
                                    "items": {"type": "number"},
                                    "nullable": True,
                                },
                                "col_linkage": {
                                    "type": "array",
                                    "items": {"type": "number"},
                                    "nullable": True,
                                },
                            },
                            "required": ["plot_type", "name"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
    SeabornPlotType.FACETGRID: {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "x_label": {"type": "string"},
            "y_label": {"type": "string"},
            "legend": {"type": "boolean", "default": True},
            "data": {
                "type": "object",
                "properties": {
                    "series": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "plot_type": {"type": "string", "enum": ["facetgrid"]},
                                "name": {"type": "string"},
                                "x": {"type": "string"},
                                "y": {"type": "string"},
                                "row": {"type": "string", "nullable": True},
                                "col": {"type": "string", "nullable": True},
                                "hue": {"type": "string", "nullable": True},
                                "col_wrap": {"type": "integer", "nullable": True},
                                "height": {"type": "number", "nullable": True},
                                "aspect": {"type": "number", "nullable": True},
                                "palette": {"type": "string", "nullable": True},
                                "margin_titles": {"type": "boolean", "nullable": True},
                                "despine": {"type": "boolean", "nullable": True},
                            },
                            "required": ["plot_type", "name", "x", "y"],
                        },
                    }
                },
                "required": ["series"],
            },
        },
        "required": ["title", "x_label", "y_label", "data"],
    },
}


CHART_INSTRUCTIONS = {
    SeabornPlotType.LINE: """
    - X axis should be continuous or temporal data (e.g., dates, time, numeric sequences)
    - Y axis should be continuous numeric data
    - Consider using 'hue' for categorical variables to show multiple lines
    - Use 'style' to vary line patterns for better distinction
    - Set 'markers' for clearer data points when data is sparse
    """,
    SeabornPlotType.SCATTER: """
    - Both X and Y should typically be continuous numeric variables
    - Use 'hue' for categorical variables to color-code points
    - 'size' can represent a third numeric variable
    - Consider alpha transparency for dense plots
    """,
    SeabornPlotType.BOXPLOT: """
    - X axis should be categorical data
    - Y axis should be continuous numeric data
    - Use 'hue' for nested categorical variables
    - Consider 'dodge' when using hue to separate boxes
    """,
    SeabornPlotType.VIOLINPLOT: """
    - X axis should be categorical data
    - Y axis should be continuous numeric data
    - Use 'hue' for nested categories
    - Consider 'split' for binary categorical variables
    """,
    SeabornPlotType.HEATMAP: """
    - Input should be a correlation matrix or pivot table
    - Both axes represent variables or categories
    - Use 'annot' for showing numeric values
    - Consider 'mask' for showing only half of a symmetric matrix
    """,
    SeabornPlotType.HISTPLOT: """
    - X axis should be continuous numeric data
    - Consider 'hue' for categorical splits
    - Use 'bins' to control granularity
    - 'kde' can be added for density estimation
    """,
    SeabornPlotType.BARPLOT: """
    - X axis typically categorical
    - Y axis should be continuous numeric data
    - Use 'hue' for grouped bars
    - Consider 'ci' for confidence intervals
    """,
    SeabornPlotType.COUNTPLOT: """
    - X axis must be categorical
    - No Y variable needed (counts automatically calculated)
    - Use 'hue' for nested categories
    """,
    SeabornPlotType.POINTPLOT: """
    - X axis typically categorical
    - Y axis should be continuous numeric data
    - Use 'hue' for grouped points
    - Consider 'ci' for confidence intervals
    """,
    SeabornPlotType.REGPLOT: """
    - Both X and Y should be continuous numeric variables
    - Use 'hue' for categorical splits
    - Consider 'order' for polynomial fits
    - 'ci' controls confidence interval display
    """,
    SeabornPlotType.KDEPLOT: """
    - X axis should be continuous numeric data
    - Use 'hue' for categorical splits
    - Y axis automatically shows density
    - Consider 'multiple' for handling multiple distributions
    """,
    SeabornPlotType.SWARMPLOT: """
    - X axis should be categorical
    - Y axis should be continuous numeric data
    - Use 'hue' for categorical splits
    - Good for showing distribution of small datasets
    """,
    SeabornPlotType.STRIPPLOT: """
    - X axis should be categorical
    - Y axis should be continuous numeric data
    - Use 'hue' for categorical splits
    - Consider 'jitter' for overlapping points
    """,
    SeabornPlotType.JOINTPLOT: """
    - Both X and Y should be continuous numeric variables
    - Use 'hue' for categorical splits
    - Consider 'kind' for different plot types
    - Shows both joint and marginal distributions
    """,
    SeabornPlotType.PAIRPLOT: """
    - Input variables should be numeric
    - Use 'hue' for categorical coloring
    - 'vars' should list the variables to plot
    - Consider 'diag_kind' for diagonal plots
    """,
    SeabornPlotType.RESIDPLOT: """
    - X should be model predictions or independent variable
    - Y should be residuals or dependent variable
    - Consider 'lowess' for trend line
    - Use 'scatter_kws' for point styling
    """,
    SeabornPlotType.CLUSTERMAP: """
    - Input should be a matrix of numeric values
    - Rows and columns represent variables or samples
    - Consider 'standard_scale' for normalization
    - Use 'cmap' for color scheme
    """,
    SeabornPlotType.FACETGRID: """
    - Base plot variables follow their respective plot type rules
    - 'row' and 'col' should be categorical
    - Consider 'col_wrap' for grid layout
    - Use 'height' and 'aspect' for sizing
    """,
}


class ChartGenerator(BaseNode):
    """
    LLM Agent to create chart configurations based on natural language descriptions.
    llm, data visualization, charts

    Use cases:
    - Generating chart configurations from natural language descriptions
    - Creating data visualizations programmatically
    - Converting data analysis requirements into visual representations
    """

    model: LlamaModel = Field(
        default=LlamaModel(),
        description="The Llama model to use for chart generation.",
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096 * 2,
        description="The context window size to use for the model.",
    )
    prompt: str = Field(
        default="",
        description="Natural language description of the desired chart",
    )
    plot_type: SeabornPlotType = Field(
        default=SeabornPlotType.LINE,
        description="The type of plot to generate",
    )
    data: DataframeRef = Field(
        default=DataframeRef(),
        description="The data to visualize",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    top_k: int = Field(
        default=50,
        ge=1,
        le=100,
        description="The number of highest probability tokens to keep for top-k sampling.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )
    keep_alive: int = Field(
        default=300,
        description="The number of seconds to keep the model alive.",
    )
    columns: RecordType = Field(
        default=RecordType(),
        description="The columns available in the data.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "prompt", "data", "plot_type"]

    async def process(self, context: ProcessingContext) -> ChartConfig:
        if self.data.columns is None:
            raise ValueError("No columns defined in the data")

        example_chart = EXAMPLE_CHARTS.get(self.plot_type)
        instructions = CHART_INSTRUCTIONS.get(self.plot_type)
        plot_schema = PLOT_TYPE_SCHEMAS.get(self.plot_type)

        if not plot_schema:
            raise ValueError(f"No schema defined for plot type: {self.plot_type}")

        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": f"""You are an expert data visualization assistant that helps generate chart configurations following Seaborn best practices.
                        You will generate a {self.plot_type.value} plot configuration based on the user's request.
                        {instructions}

                        Example chart:
                        {json.dumps(example_chart, indent=2)}
                        """,
                    },
                    {
                        "role": "user",
                        "content": f"""Available columns in the dataset:
                        {json.dumps([c.model_dump() for c in self.data.columns], indent=2)}
                        
                        User request: {self.prompt}
                        
                        Generate a {self.plot_type.value} plot configuration using the available columns.""",
                    },
                ],
                "format": plot_schema,
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "num_predict": 4096,
                    "num_ctx": self.context_window,
                },
            },
        )

        # Rest of the processing remains the same
        content = str(res["message"]["content"])
        print(content)
        start = content.find("{")
        end = content.rfind("}")

        if start == -1 or end == -1:
            raise ValueError(
                f"No valid JSON data found in the response: {content[:1000]}"
            )

        content = content[start : end + 1]
        chart_config_dict = json.loads(content)

        # Validate and create instance using Pydantic
        validated_config = ChartConfigSchema(**chart_config_dict)

        # Convert to ChartConfig
        chart_data = ChartData(
            series=[
                DataSeries(**series.model_dump())
                for series in validated_config.data.series
            ],
            row=validated_config.data.row,
            col=validated_config.data.col,
            col_wrap=validated_config.data.col_wrap,
        )

        return ChartConfig(
            title=validated_config.title,
            x_label=validated_config.x_label,
            y_label=validated_config.y_label,
            legend=validated_config.legend,
            legend_position=validated_config.legend_position or "auto",
            height=validated_config.height,
            aspect=validated_config.aspect,
            x_scale=validated_config.x_scale,
            y_scale=validated_config.y_scale,
            x_lim=validated_config.x_lim,
            y_lim=validated_config.y_lim,
            palette=validated_config.palette,
            hue_order=validated_config.hue_order,
            hue_norm=validated_config.hue_norm,
            sizes=validated_config.sizes,
            size_order=validated_config.size_order,
            size_norm=validated_config.size_norm,
            marginal_kws=validated_config.marginal_kws,
            joint_kws=validated_config.joint_kws,
            diag_kind=validated_config.diag_kind,
            corner=validated_config.corner,
            center=validated_config.center,
            vmin=validated_config.vmin,
            vmax=validated_config.vmax,
            cmap=validated_config.cmap,
            annot=validated_config.annot,
            fmt=validated_config.fmt,
            square=validated_config.square,
            data=chart_data,
        )


class SchemaGenerator(BaseNode):
    """
    LLM Agent to generate structured data based on a provided JSON schema.
    llm, json schema, data generation, structured data

    Use cases:
    - Generate sample data matching a specific schema
    - Create test data with specific structure
    - Convert natural language to structured data
    - Populate templates with generated content
    """

    model: LlamaModel = Field(
        default=LlamaModel(), description="The Llama model to use."
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096 * 2,
        description="The context window size to use for the model.",
    )
    prompt: str = Field(
        default="",
        description="The user prompt for data generation",
    )
    schema: str = Field(
        default="",
        description="The JSON schema that defines the structure of the output",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    top_k: int = Field(
        default=50,
        ge=1,
        le=100,
        description="The number of highest probability tokens to keep for top-k sampling.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )
    keep_alive: int = Field(
        default=300,
        description="The number of seconds to keep the model alive.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "prompt", "schema"]

    async def process(self, context: ProcessingContext) -> dict:
        if not self.schema:
            raise ValueError(f"JSON schema must be provided: {self.schema}")

        schema = json.loads(self.schema)

        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": """You are an assistant that generates data according to JSON schemas.
                        You will be provided with a schema and a prompt, and should return valid JSON that matches the schema.
                        Ensure all required fields are included and data types are correct.""",
                    },
                    {
                        "role": "user",
                        "content": f"""Generate data according to this schema:
                        {json.dumps(self.schema, indent=2)}

                        Requirements: {self.prompt}

                        Respond with valid JSON that matches the schema.""",
                    },
                ],
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "format": schema,
                    "num_predict": 4096,
                    "num_ctx": self.context_window,
                },
            },
        )

        content = str(res["message"]["content"])

        # Extract JSON content
        start = content.find("{")
        end = content.rfind("}")

        if start == -1 or end == -1:
            raise ValueError(
                f"No valid JSON data found in the response: {content[:1000]}"
            )

        content = content[start : end + 1]
        return json.loads(content)


class Classifier(BaseNode):
    """
    LLM Agent to classify text into predefined categories.
    llm, classification, text analysis

    Use cases:
    - Text categorization
    - Sentiment analysis
    - Topic classification
    - Intent detection
    """

    model: LlamaModel = Field(
        default=LlamaModel(),
        description="The Llama model to use for classification.",
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096 * 2,
        description="The context window size to use for the model.",
    )
    input_text: str = Field(
        default="",
        description="The text to classify",
    )
    labels: str = Field(
        default="",
        description="Comma-separated list of possible classification labels",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    top_k: int = Field(
        default=1,
        ge=1,
        le=100,
        description="The number of highest probability tokens to keep for top-k sampling.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )
    keep_alive: int = Field(
        default=300,
        description="The number of seconds to keep the model alive.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "input_text", "labels"]

    async def process(self, context: ProcessingContext) -> str:
        labels_list = [label.strip() for label in self.labels.split(",")]

        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": f"""You are a text classifier. Your task is to classify the given text into exactly one of the following categories: {self.labels}

Rules:
1. Choose exactly one label from the provided options
2. Respond ONLY with the chosen label, no explanation or additional text
3. If unsure, choose the most likely label based on the available options
4. The classification should be case-sensitive and match exactly one of the provided labels
5. Do not create new labels or combine existing ones""",
                    },
                    {
                        "role": "user",
                        "content": f"Text to classify: {self.input_text}. ONLY RESPOND WITH THE LABEL, NO EXPLANATION OR ADDITIONAL TEXT",
                    },
                ],
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "num_predict": 4096,
                    "num_ctx": self.context_window,
                },
            },
        )

        return str(res["message"]["content"]).strip()


class SummarizeChunks(BaseNode):
    """
    LLM Agent to break down and summarize long text into manageable chunks.
    llm, summarization, text processing

    Use cases:
    - Breaking down long documents
    - Initial summarization of large texts
    - Preparing content for final summarization
    """

    model: LlamaModel = Field(
        default=LlamaModel(),
        description="The Llama model to use for summarization.",
    )
    prompt: str = Field(
        default="""
        Create a summary following these rules:
        • Focus ONLY on the key information from the source text
        • Maintain a neutral, objective tone throughout
        • Present information in a logical flow
        • Remove any redundant points
        • Keep only the most important ideas and relationships
        * NO CONCLUSION
        * NO INTRODUCTION
        * NO EXPLANATION OR ADDITIONAL TEXT
        * ONLY RESPOND WITH THE SUMMARY""",
        description="Instruction for summarizing individual chunks of text",
    )
    text: str = Field(
        default="",
        description="The text to summarize",
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096 * 4,
        description="The context window size to use for the model.",
    )
    num_predict: int = Field(
        default=4096,
        ge=0,
        le=4096 * 4,
        description="Number of tokens to predict for each chunk",
    )
    chunk_overlap: int = Field(
        default=100,
        ge=0,
        description="Number of tokens to overlap between chunks",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    top_k: int = Field(
        default=50,
        ge=1,
        le=100,
        description="The number of highest probability tokens to keep for top-k sampling.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )
    keep_alive: int = Field(
        default=300,
        description="The number of seconds to keep the model alive.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "text", "prompt"]

    async def _summarize_chunk(
        self,
        context: ProcessingContext,
        text: str,
        total_output_tokens: int = 0,
        token_progress: int = 0,
    ) -> str:
        parts = []
        async for response in context.stream_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "stream": True,
                "messages": [
                    {"role": "system", "content": self.prompt},
                    {"role": "user", "content": text},
                ],
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "num_ctx": self.context_window,
                    "num_predict": self.num_predict,
                },
            },
        ):
            assert isinstance(response, ChatResponse)
            msg = response.message.content
            if msg:
                count_tokens = len(tiktoken.get_encoding("cl100k_base").encode(msg))
                parts.append(msg)
                token_progress += count_tokens
                context.post_message(
                    NodeProgress(
                        node_id=self._id,
                        progress=token_progress,
                        total=total_output_tokens,
                        chunk=msg,
                    )
                )
        return "".join(parts)

    async def process(self, context: ProcessingContext) -> list[str]:
        effective_context_size = self.context_window - 32
        encoding = tiktoken.get_encoding("cl100k_base")
        total_tokens = len(encoding.encode(self.text))

        # Calculate expected output tokens
        chunks_needed = max(1, total_tokens // effective_context_size)
        total_output_tokens = int(self.num_predict * chunks_needed)
        token_progress = 0

        if total_tokens <= effective_context_size:
            summary = await self._summarize_chunk(
                context, self.text, total_output_tokens, 0
            )
            return [summary]

        chunks = split_text_into_chunks(
            self.text, chunk_size=effective_context_size, overlap=self.chunk_overlap
        )

        summaries = []
        for chunk in chunks:
            summary = await self._summarize_chunk(
                context, chunk, total_output_tokens, token_progress
            )
            summaries.append(summary)
            token_progress += self.num_predict

        return summaries


class Summarizer(BaseNode):
    """
    LLM Agent to summarize text
    llm, summarization, text processing

    Use cases:
    - Creating final summaries from multiple sources
    - Combining chapter summaries
    - Generating executive summaries
    """

    model: LlamaModel = Field(
        default=LlamaModel(),
        description="The Llama model to use for summarization.",
    )
    prompt: str = Field(
        default="""Create a summary following these rules:
• Focus ONLY on the key information from the source text
• Maintain a neutral, objective tone throughout
• Present information in a logical flow
• Remove any redundant points
• Keep only the most important ideas and relationships
* NO CONCLUSION
* NO INTRODUCTION
* NO EXPLANATION OR ADDITIONAL TEXT
* ONLY RESPOND WITH THE SUMMARY""",
        description="Instruction for creating the final summary",
    )
    text: str = Field(
        default="",
        description="The text to summarize",
    )
    num_predict: int = Field(
        default=4096,
        ge=0,
        le=4096 * 4,
        description="Number of tokens to predict",
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096 * 4,
        description="The context window size to use for the model.",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    top_k: int = Field(
        default=50,
        ge=1,
        le=100,
        description="The number of highest probability tokens to keep for top-k sampling.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )
    keep_alive: int = Field(
        default=300,
        description="The number of seconds to keep the model alive.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "text", "prompt"]

    async def process(self, context: ProcessingContext) -> str:
        encoding = tiktoken.get_encoding("cl100k_base")

        if not self.model.is_set():
            raise ValueError("Model is not set")

        parts = []
        token_progress = 0

        async for response in context.stream_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "stream": True,
                "messages": [
                    {"role": "system", "content": self.prompt},
                    {"role": "user", "content": self.text},
                ],
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "num_ctx": self.context_window,
                    "num_predict": self.num_predict,
                },
            },
        ):
            assert isinstance(response, ChatResponse)
            msg = response.message.content
            if msg:
                count_tokens = len(encoding.encode(msg))
                parts.append(msg)
                token_progress += count_tokens
                context.post_message(
                    NodeProgress(
                        node_id=self._id,
                        progress=token_progress,
                        total=self.num_predict,
                        chunk=msg,
                    )
                )

        return "".join(parts)


class RegressionAnalyst(BaseNode):
    """
    Agent that performs regression analysis on a given dataframe and provides insights.
    llm, regression analysis, statistics

    Use cases:
    - Performing linear regression on datasets
    - Interpreting regression results like a data scientist
    - Providing statistical summaries and insights
    """

    model: LlamaModel = Field(
        default=LlamaModel(),
        description="The Llama model to use for regression analysis.",
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096 * 2,
        description="The context window size to use for the model.",
    )
    prompt: str = Field(
        default="",
        description="The user prompt or question regarding the data analysis.",
    )
    data: DataframeRef = Field(
        default=DataframeRef(),
        description="The dataframe to perform regression on.",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    top_k: int = Field(
        default=50,
        ge=1,
        le=100,
        description="The number of highest probability tokens to keep for top-k sampling.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )
    keep_alive: int = Field(
        default=300,
        description="The number of seconds to keep the model alive.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "prompt", "data"]

    async def process(self, context: ProcessingContext) -> str:
        assert self.data.data is not None, "Data is required"
        assert self.data.columns is not None, "Columns are required"

        # Convert data to pandas DataFrame
        df = pd.DataFrame(
            self.data.data, columns=[col.name for col in self.data.columns]
        )

        # First, use LLM to determine regression parameters
        parameter_schema = {
            "type": "object",
            "properties": {
                "target_variable": {"type": "string"},
                "feature_variables": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": ["target_variable", "feature_variables"],
            "additionalProperties": False,
        }

        parameter_res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": "You are an expert data scientist who helps set up regression analyses.",
                    },
                    {
                        "role": "user",
                        "content": f"""Given the following columns in the dataset:
{[col.model_dump() for col in self.data.columns]}

And the user's analysis request:
{self.prompt}

Please specify:
1. Which variable should be the target (dependent) variable
2. Which variables should be used as features (independent variables)
3. Any specific regression parameters or considerations

Provide your response in JSON format.""",
                    },
                ],
                "format": parameter_schema,
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "num_predict": 4096,
                    "num_ctx": self.context_window,
                },
            },
        )

        content = str(parameter_res["message"]["content"])
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1:
            raise ValueError(f"No valid JSON found in response: {content[:1000]}")

        regression_params = json.loads(content[start : end + 1])
        target_variable = regression_params["target_variable"]
        feature_variables = regression_params["feature_variables"]

        # Validate variables exist in dataframe
        if target_variable not in df.columns:
            raise ValueError(f"Target variable {target_variable} not found in data")

        missing_features = [col for col in feature_variables if col not in df.columns]
        if missing_features:
            raise ValueError(f"Feature variables not found in data: {missing_features}")

        # Identify categorical columns
        categorical_columns = (
            df[feature_variables].select_dtypes(include=["object"]).columns
        )
        numeric_columns = (
            df[feature_variables].select_dtypes(exclude=["object"]).columns
        )

        # Create dummy variables for categorical columns
        X = df[numeric_columns].copy()
        if len(categorical_columns) > 0:
            X = pd.concat(
                [
                    X,
                    pd.get_dummies(
                        df[categorical_columns], drop_first=True, dtype=float
                    ),
                ],
                axis=1,
            )

        # Add constant term for intercept
        X = sm.add_constant(X)
        y = df[target_variable]

        # Perform OLS regression
        model = sm.OLS(y, X).fit()
        summary = model.summary().as_text()

        # Add information about categorical variables to the prompt
        categorical_info = ""
        if len(categorical_columns) > 0:
            categorical_info = f"""
Note: The following categorical variables were converted to dummy variables:
{', '.join(categorical_columns)}
Each categorical variable was encoded using dummy variables (one-hot encoding), with one category dropped to avoid multicollinearity.
"""

        # Get interpretation from LLM
        interpretation_res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": "You are an expert data scientist who provides detailed interpretations of regression analysis results.",
                    },
                    {
                        "role": "user",
                        "content": f"""The following is the output from an OLS regression analysis:

Target Variable: {target_variable}
Feature Variables: {', '.join(feature_variables)}

{summary}

{categorical_info}

Please provide an interpretation of these results as a data scientist would, focusing on:
1. The significance of the coefficients
2. R-squared value and model fit
3. Any potential issues or insights
4. Interpretation of dummy variables (if present)

User's original question: {self.prompt}""",
                    },
                ],
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "num_predict": 4096,
                    "num_ctx": self.context_window,
                },
            },
        )

        return str(interpretation_res["message"]["content"])


class DataExtractor(BaseNode):
    """
    LLM Agent to extract structured data from text based on a provided JSON schema.
    llm, data extraction, text analysis

    Use cases:
    - Extract specific fields from unstructured text
    - Convert text to structured data formats
    - Information extraction from documents
    - Named entity recognition with specific schema
    """

    model: LlamaModel = Field(
        default=LlamaModel(), description="The Llama model to use."
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096 * 2,
        description="The context window size to use for the model.",
    )
    text: str = Field(
        default="",
        description="The text to extract data from",
    )
    system_prompt: str = Field(
        default="",
        description="The system prompt to use for the model.",
    )
    json_schema: JSONRef = Field(
        default=JSONRef(),
        description="The JSON schema that defines the structure of the output. Must be an object type.",
    )
    temperature: float = Field(
        default=0.2,
        ge=0.0,
        le=2.0,
        description="The temperature to use for sampling.",
    )
    top_k: int = Field(
        default=50,
        ge=1,
        le=100,
        description="The number of highest probability tokens to keep for top-k sampling.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )
    keep_alive: int = Field(
        default=300,
        description="The number of seconds to keep the model alive.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "text", "json_schema", "system_prompt"]

    def validate_schema(self, schema: dict) -> None:
        """Validate that the provided schema is an object type"""
        if not isinstance(schema, dict):
            raise ValueError("Schema must be a dictionary", schema)

        schema_type = schema.get("type")
        if schema_type != "object":
            raise ValueError("Schema must have type 'object'")

    async def process(self, context: ProcessingContext) -> dict:
        if self.json_schema.data is None:
            raise ValueError("Schema is not set")

        try:
            json_schema = json.loads(self.json_schema.data)
        except Exception as e:
            raise ValueError("Invalid JSON schema", e)

        self.validate_schema(json_schema)

        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": self.system_prompt,
                    },
                    {
                        "role": "user",
                        "content": self.text,
                    },
                ],
                "format": json_schema,
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "num_predict": 4096,
                    "num_ctx": self.context_window,
                },
            },
        )

        content = str(res["message"]["content"])

        print(content)

        # Extract JSON content
        start = content.find("{")
        end = content.rfind("}")

        if start == -1 or end == -1:
            raise ValueError(
                f"No valid JSON data found in the response: {content[:1000]}"
            )

        content = content[start : end + 1]
        return json.loads(content)
