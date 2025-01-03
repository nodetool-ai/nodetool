import json
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
    LlamaModel,
    Provider,
    RecordType,
    SVGElement,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


from nodetool.metadata.types import LlamaModel
from nodetool.workflows.base_node import BaseNode
from pydantic import Field


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
        default="300",
        description="The number of seconds to keep the model alive.",
    )
    columns: RecordType = Field(
        default=RecordType(),
        description="The columns to use in the dataframe.",
    )

    def requires_gpu(self) -> bool:
        return True

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
                        The table will have the following columns:
                        {columns_str}
                        The table should be in the following format:
                        [
                            {json.dumps(example_row)},
                            {json.dumps(example_row)},
                        ]
                        """,
                    },
                    {"role": "user", "content": self.prompt + ". Return as JSON."},
                ],
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "format": json_schema_for_dataframe(self.columns.columns),
                    "num_ctx": self.context_window,
                },
            },
        )
        content = str(res["message"]["content"])

        print(content)

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
                        "description": "SVG tag name (e.g., circle, rect, path, text)",
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
        default="300",
        description="The number of seconds to keep the model alive.",
    )

    def requires_gpu(self) -> bool:
        return True

    async def process(self, context: ProcessingContext) -> list[SVGElement]:
        example_svg = {
            "elements": [
                {
                    "name": "circle",
                    "attributes": {"cx": "50", "cy": "50", "r": "40", "fill": "red"},
                    "content": "",
                    "children": [],
                }
            ]
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
                        You are an assistant that creates SVG elements in JSON format.
                        Each SVG element should have:
                        - name: The SVG tag name (e.g., circle, rect, path)
                        - attributes: A dictionary of SVG attributes
                        - content: Any text content (usually empty for shapes)
                        - children: A list of nested SVG elements

                        Respond with a JSON object in this format:
                        {json.dumps(example_svg, indent=2)}
                        """,
                    },
                    {"role": "user", "content": self.prompt + ". Respond using JSON."},
                ],
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "format": SVG_JSON_SCHEMA,
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
        description="The context window size to use for the model.",
    )
    prompt: str = Field(
        default="",
        description="Natural language description of the desired chart",
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
        default="300",
        description="The number of seconds to keep the model alive.",
    )
    columns: RecordType = Field(
        default=RecordType(),
        description="The columns available in the data.",
    )

    def requires_gpu(self) -> bool:
        return True

    async def process(self, context: ProcessingContext) -> ChartConfig:
        if self.data.columns is None:
            raise ValueError("No columns defined in the data")

        # Create example chart config for the model
        example_config = {
            "title": "Example Chart",
            "x_label": "X Axis",
            "y_label": "Y Axis",
            "legend": True,
            "data": {
                "series": [
                    {
                        "name": "Series 1",
                        "x": "column_x",
                        "y": "column_y",
                        "plot_type": "lineplot",
                    }
                ]
            },
        }

        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": """You are an expert data visualization assistant that helps generate chart configurations.
                        Analyze the data and user's request to create the most appropriate visualization.
                        Consider the data types and relationships when choosing plot types.
                        You can create complex visualizations using multiple series and facets.""",
                    },
                    {
                        "role": "user",
                        "content": f"""Available columns in the dataset:
                        {json.dumps([c.model_dump() for c in self.data.columns], indent=2)}
                        
                        User request: {self.prompt}
                        
                        Create a chart configuration that best visualizes this data.
                        Respond with a JSON object in this format:
                        {json.dumps(example_config, indent=2)}
                        
                        Reference the columns by their names above.""",
                    },
                ],
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "num_ctx": self.context_window,
                },
            },
        )

        # Extract and parse JSON content
        content = str(res["message"]["content"])
        start = content.find("{")
        end = content.rfind("}")

        if start == -1 or end == -1:
            raise ValueError(
                f"No valid JSON data found in the response: {content[:1000]}"
            )

        content = content[start : end + 1]
        chart_config_dict = json.loads(content)

        # Rest of the validation and conversion code remains the same as the OpenAI version
        validated_config = ChartConfigSchema(**chart_config_dict)

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
            legend_position=validated_config.legend_position,
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
