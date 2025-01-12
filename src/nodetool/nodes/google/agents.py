from typing import Any, Literal, TypeVar, Generic
import typing_extensions as typing
import google.generativeai as genai
from pydantic import BaseModel, Field
from nodetool.metadata.types import (
    ColumnType,
    Message,
    Provider,
    ImageRef,
    AudioRef,
    DataframeRef,
    RecordType,
    SVGElement,
    Task,
)
from nodetool.nodes.openai.agents import ThoughtStep
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from .gemini import GeminiModel
import json
from google.generativeai.protos import Schema
from google.ai.generativelanguage_v1beta.types.content import Type
from xml.etree import ElementTree as ET
from io import StringIO


class TaskSchema(typing.TypedDict):
    name: str
    type: Literal["text", "image"]
    instructions: str
    dependencies: list[str]


class TasksResponse(typing.TypedDict):
    tasks: list[TaskSchema]


class ThoughtStepSchema(typing.TypedDict):
    step_number: int
    instructions: str
    reasoning: str
    result: str


class ChainOfThoughtResponse(typing.TypedDict):
    analysis: str
    steps: list[ThoughtStepSchema]


def _extract_svg_content(text: str) -> str:
    """Extract SVG content from text that might contain additional content."""
    # find the first <svg> tag
    start = text.find("<svg")
    end = text.find("</svg>")
    if start == -1 or end == -1:
        raise ValueError("No valid SVG content found in the response")
    return text[start : end + 6]


def _extract_json_content(text: str) -> str:
    """Extract JSON content from text that might contain additional content."""
    # Find first { or [
    start_brace = text.find("{")
    start_bracket = text.find("[")

    # Determine which character appears first (if any)
    if start_brace == -1 and start_bracket == -1:
        raise ValueError("No valid JSON object or array found in the response")

    if start_brace == -1 or (start_bracket != -1 and start_bracket < start_brace):
        start = start_bracket
        end = text.rfind("]")
    else:
        start = start_brace
        end = text.rfind("}")

    if end == -1:
        raise ValueError("No matching closing bracket/brace found")

    return text[start : end + 1]


class GeminiAgent(BaseNode):
    """
    Gemini version of the Agent node for task planning and goal decomposition.
    agent, planning, task, decomposition
    Use cases:
    - Breaking down complex tasks into smaller steps
    - Creating task dependencies and workflows
    - Planning multi-step processes
    """

    goal: str = Field(default="", description="The user prompt")
    model: GeminiModel = Field(
        default=GeminiModel.Gemini2_0_Flash_Exp, description="The Gemini model to use"
    )
    temperature: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Temperature for sampling"
    )

    async def process(self, context: ProcessingContext) -> list[Task]:
        system_prompt = """
        Generate a full list of tasks to achieve the goal below.
        Model the tasks as a directed acyclic graph (DAG) with dependencies.
        These tasks will be executed in order to achieve the goal.
        The output of each task will be available to dependent tasks.
        Tasks will be executed by specialized models and tools.
        Describe each task in detail.
        """

        model = genai.GenerativeModel(self.model.value)

        result = await context.run_prediction(
            node_id=self.id,
            provider=Provider.Gemini,
            model=self.model.value,
            params={
                "contents": [self.goal],
                "system_instruction": system_prompt,
                "config": {
                    "temperature": self.temperature,
                    "max_output_tokens": 8192,
                    "response_mime_type": "application/json",
                    "response_schema": TasksResponse,
                },
            },
        )

        json_content = result["candidates"][0]["content"]["parts"][0]["text"]
        json_content = _extract_json_content(json_content)
        tasks_data = json.loads(json_content)

        created_tasks = []
        for task_data in tasks_data["tasks"]:
            task = Task(
                task_type=task_data["type"],
                name=task_data["name"],
                instructions=task_data["instructions"],
                dependencies=task_data.get("dependencies", []),
            )
            created_tasks.append(task)

        return created_tasks


class ChainOfThought(BaseNode):
    """
    Gemini version of chain-of-thought reasoning node for breaking down complex problems into clear steps.
    agent, reasoning, analysis, problem-solving
    Use cases:
    - Analyzing complex problems step by step
    - Breaking down solutions into logical steps
    - Providing detailed reasoning for decisions
    """

    messages: list[Message] = Field(default=[], description="The messages to analyze")
    model: GeminiModel = Field(default=GeminiModel.Gemini2_0_Flash_Exp)
    temperature: float = Field(default=0.0, ge=0.0, le=1.0)

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["messages"]

    async def process(self, context: ProcessingContext) -> dict:
        system_prompt = """
        You are an expert at breaking down complex problems into clear steps.
        For any given problem:
        1. First analyze and understand the key components
        2. Break down the solution into logical steps
        3. Give instructions for each step
        4. Don't overthink the problem, just break it down into clear steps
        5. Minimize the number of steps
        """

        result = await context.run_prediction(
            node_id=self.id,
            provider=Provider.Gemini,
            model=self.model.value,
            params={
                "contents": [m.content for m in self.messages],
                "system_instruction": system_prompt,
                "config": {
                    "temperature": self.temperature,
                    "max_output_tokens": 8192,
                    "response_mime_type": "application/json",
                    "response_schema": ChainOfThoughtResponse,
                },
            },
        )

        json_content = result["candidates"][0]["content"]["parts"][0]["text"]
        json_content = _extract_json_content(json_content)
        response = json.loads(json_content)

        return {
            "analysis": response["analysis"],
            "steps": [ThoughtStep(**step) for step in response["steps"]],
        }


class DataGenerator(BaseNode):
    """
    Gemini version of the data generator for creating dataframes based on user prompts. Supports multimodal inputs including images and audio.
    data, generator, dataframe, multimodal
    Use cases:
    - Creating a dataset for a machine learning model
    - Creating a dataset for a data visualization
    - Creating a dataset for a data analysis
    """

    model: GeminiModel = Field(
        default=GeminiModel.Gemini2_0_Flash_Exp, description="The Gemini model to use"
    )
    prompt: str = Field(default="", description="The user prompt")
    image: ImageRef = Field(
        default=ImageRef(), description="Image to use for generation"
    )
    audio: AudioRef = Field(
        default=AudioRef(), description="Audio to use for generation"
    )
    columns: RecordType = Field(
        default=RecordType(), description="The columns to use in the dataframe"
    )
    temperature: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Temperature for sampling"
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["prompt", "image", "audio", "columns"]

    async def process(self, context: ProcessingContext) -> DataframeRef:
        columns_str = ", ".join(
            [
                f"{col.name}: {col.data_type} ({col.description})"
                for col in self.columns.columns
            ]
        )

        example_row = {
            col.name: self._example_value_for_type(col.data_type)
            for col in self.columns.columns
        }

        # Prepare contents list for multimodal input
        contents = []

        # Add image if provided
        if self.image.is_set():
            image = await context.image_to_pil(self.image)
            contents.append(image)

        # Add audio if provided
        if self.audio.is_set():
            audio = await context.asset_to_bytes(self.audio)
            contents.append({"mime_type": "audio/opus", "data": audio})

        # Add the main prompt with instructions
        contents.append(
            f"""
        Generate a dataframe for the following prompt: {self.prompt}
        Each row should have the following properties: {columns_str}
        """
        )

        system_prompt = """
        You are an expert at generating datasets.
        """

        def proto_type(data_type: ColumnType) -> Type:
            if data_type == "string":
                return Type.STRING
            elif data_type == "int":
                return Type.INTEGER
            elif data_type == "float":
                return Type.NUMBER
            elif data_type == "datetime":
                return Type.STRING
            else:
                raise ValueError(f"Unsupported data type: {data_type}")

        result = await context.run_prediction(
            node_id=self.id,
            provider=Provider.Gemini,
            model=self.model.value,
            params={
                "contents": contents,
                "system_instruction": system_prompt,
                "config": {
                    "temperature": self.temperature,
                    "top_p": 0.9,
                    "top_k": 40,
                    "max_output_tokens": 8192,
                    "response_mime_type": "application/json",
                    "response_schema": Schema(
                        type=Type.ARRAY,
                        items=Schema(
                            type=Type.OBJECT,
                            properties={
                                col.name: Schema(type=proto_type(col.data_type))
                                for col in self.columns.columns
                            },
                            required=list(col.name for col in self.columns.columns),
                        ),
                    ),
                },
            },
        )

        json_content = result["candidates"][0]["content"]["parts"][0]["text"]
        json_content = _extract_json_content(json_content)
        data = json.loads(json_content)

        # convert list of dicts into list of lists, index by column name
        list_data = [[row[col.name] for col in self.columns.columns] for row in data]

        return DataframeRef(columns=self.columns.columns, data=list_data)

    @staticmethod
    def _example_value_for_type(data_type: str) -> str:
        type_examples = {
            "string": "example",
            "int": "123",
            "float": "123.45",
            "datetime": "2024-01-01",
            "object": "{}",
        }
        return type_examples.get(data_type, "")


def parse_svg_content(content: str) -> list[SVGElement]:
    """
    Parse SVG content string into a list of SVGElement objects using XML parser.
    Maintains hierarchical structure of SVG elements.

    Args:
        content: Raw SVG content string

    Returns:
        List of SVGElement objects representing the parsed SVG elements
    """

    def process_element(elem: ET.Element) -> SVGElement:
        children = []
        for child in elem:
            children.append(process_element(child))

        local_name = elem.tag.split("}")[-1]

        return SVGElement(
            name=local_name,
            attributes=elem.attrib,
            content=elem.text,
            children=children,
        )

    try:
        # Parse XML content
        tree = ET.parse(StringIO(content))
        root = tree.getroot()

        elements = []
        # Process direct children of SVG root
        for elem in root:
            elements.append(process_element(elem))

        return elements

    except ET.ParseError as e:
        raise ValueError(f"Invalid SVG content: {str(e)}")


class SVGGenerator(BaseNode):
    """
    Gemini version of SVG generator for creating SVG elements based on user prompts.
    svg, generator, vector, graphics
    Use cases:
    - Creating vector graphics from text descriptions
    - Generating scalable illustrations
    - Creating custom icons and diagrams
    """

    model: GeminiModel = Field(
        default=GeminiModel.Gemini2_0_Flash_Exp, description="The Gemini model to use"
    )
    prompt: str = Field(default="", description="The user prompt for SVG generation")
    image: ImageRef = Field(
        default=ImageRef(), description="Image to use for generation"
    )
    audio: AudioRef = Field(
        default=AudioRef(), description="Audio to use for generation"
    )
    temperature: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Temperature for sampling"
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["prompt", "image", "audio"]

    async def process(self, context: ProcessingContext) -> list[SVGElement]:
        system_prompt = f"""
        You are an expert at creating SVG.
        ONLY RESPOND WITH THE SVG CONTENT, NO OTHER TEXT.
        """

        # Prepare contents list for multimodal input
        contents = []

        # Add image if provided
        if self.image.is_set():
            image = await context.image_to_pil(self.image)
            contents.append(image)

        # Add audio if provided
        if self.audio.is_set():
            audio = await context.asset_to_bytes(self.audio)
            contents.append({"mime_type": "audio/opus", "data": audio})

        # Add the system prompt and user prompt
        contents.extend(
            [self.prompt + ". ONLY RESPOND WITH THE SVG CONTENT, NO OTHER TEXT."]
        )

        result = await context.run_prediction(
            node_id=self.id,
            provider=Provider.Gemini,
            model=self.model.value,
            params={
                "contents": contents,
                "system_instruction": system_prompt,
                "config": {
                    "temperature": self.temperature,
                    "max_output_tokens": 8192,
                    "response_mime_type": "text/plain",
                },
            },
        )

        svg_content = result["candidates"][0]["content"]["parts"][0]["text"]
        final_svg_content = _extract_svg_content(svg_content)

        return parse_svg_content(final_svg_content)


# class ChartGenerator(BaseNode):
#     """
#     Gemini version of chart generator for creating chart configurations based on natural language descriptions.
#     """

#     model: GeminiModel = Field(
#         default=GeminiModel.Gemini1_5_Pro, description="The Gemini model to use"
#     )
#     prompt: str = Field(
#         default="", description="Natural language description of the desired chart"
#     )
#     data: DataframeRef = Field(
#         default=DataframeRef(), description="The data to visualize"
#     )
#     temperature: float = Field(
#         default=0.7, ge=0.0, le=1.0, description="Temperature for sampling"
#     )
#     image: ImageRef = Field(
#         default=ImageRef(), description="Image to use for generation"
#     )
#     audio: AudioRef = Field(
#         default=AudioRef(), description="Audio to use for generation"
#     )

#     async def process(self, context: ProcessingContext) -> ChartConfig:
#         if self.data.columns is None:
#             raise ValueError("No columns defined in the data")

#         # Create example chart config for the model
#         example_config = {
#             "title": "Example Chart",
#             "x_label": "X Axis",
#             "y_label": "Y Axis",
#             "legend": True,
#             "data": {
#                 "series": [
#                     {
#                         "name": "Series 1",
#                         "x": "column_x",
#                         "y": "column_y",
#                         "plot_type": "lineplot",
#                     }
#                 ]
#             },
#         }

#         system_prompt = """You are an expert data visualization assistant that helps generate chart configurations.
#         Analyze the data and user's request to create the most appropriate visualization.
#         Consider the data types and relationships when choosing plot types.
#         You can create complex visualizations using multiple series and facets.
#         Respond with a valid JSON chart configuration only."""

#         # Prepare contents list for multimodal input
#         contents = []

#         # Add image if provided
#         if self.image.is_set():
#             image = await context.image_to_pil(self.image)
#             contents.append(image)

#         # Add audio if provided
#         if self.audio.is_set():
#             audio = await context.asset_to_bytes(self.audio)
#             contents.append({"mime_type": "audio/opus", "data": audio})

#         # Add the system prompt and other content
#         contents.extend(
#             [
#                 f"""Available columns in the dataset:
#             {json.dumps([c.model_dump() for c in self.data.columns], indent=2)}

#             User request: {self.prompt}

#             Create a chart configuration that best visualizes this data.
#             Respond with a JSON object in this format:
#             {json.dumps(example_config, indent=2)}

#             Reference the columns by their names above.""",
#             ]
#         )

#         result = await context.run_prediction(
#             node_id=self.id,
#             provider=Provider.Gemini,
#             model=self.model.value,
#             params={
#                 "contents": contents,
#                 "system_instruction": system_prompt,
#                 "config": {
#                     "temperature": self.temperature,
#                     "max_output_tokens": 8192,
#                     "response_mime_type": "application/json",
#                     "response_schema": ChartConfigSchema,
#                 },
#             },
#         )

#         json_content = result["candidates"][0]["content"]["parts"][0]["text"]
#         json_content = _extract_json_content(json_content)
#         chart_config_dict = json.loads(json_content)

#         # Validate and create instance using Pydantic
#         validated_config = ChartConfigSchema(**chart_config_dict)

#         # Convert to ChartConfig
#         chart_data = ChartData(
#             series=[
#                 DataSeries(**series.model_dump())
#                 for series in validated_config.data.series
#             ],
#             row=validated_config.data.row,
#             col=validated_config.data.col,
#             col_wrap=validated_config.data.col_wrap,
#         )

#         return ChartConfig(
#             title=validated_config.title,
#             x_label=validated_config.x_label,
#             y_label=validated_config.y_label,
#             legend=validated_config.legend,
#             legend_position=validated_config.legend_position,
#             height=validated_config.height,
#             aspect=validated_config.aspect,
#             x_scale=validated_config.x_scale,
#             y_scale=validated_config.y_scale,
#             x_lim=validated_config.x_lim,
#             y_lim=validated_config.y_lim,
#             palette=validated_config.palette,
#             hue_order=validated_config.hue_order,
#             hue_norm=validated_config.hue_norm,
#             sizes=validated_config.sizes,
#             size_order=validated_config.size_order,
#             size_norm=validated_config.size_norm,
#             marginal_kws=validated_config.marginal_kws,
#             joint_kws=validated_config.joint_kws,
#             diag_kind=validated_config.diag_kind,
#             corner=validated_config.corner,
#             center=validated_config.center,
#             vmin=validated_config.vmin,
#             vmax=validated_config.vmax,
#             cmap=validated_config.cmap,
#             annot=validated_config.annot,
#             fmt=validated_config.fmt,
#             square=validated_config.square,
#             data=chart_data,
#         )


class Summarizer(BaseNode):
    """
    Gemini version of the summarizer for creating concise summaries of text content.
    text, summarization, nlp, content
    Use cases:
    - Condensing long documents into key points
    - Creating executive summaries
    - Extracting main ideas from text
    """

    model: GeminiModel = Field(
        default=GeminiModel.Gemini2_0_Flash_Exp, description="The Gemini model to use"
    )
    text: str = Field(default="", description="The text to summarize")
    max_words: int = Field(
        default=150, 
        description="Target maximum number of words for the summary",
        ge=50,
        le=500
    )
    temperature: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Temperature for sampling"
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["text", "max_words"]

    async def process(self, context: ProcessingContext) -> str:
        system_prompt = f"""
        You are an expert summarizer. Your task is to create clear, accurate, and concise summaries.
        Follow these guidelines:
        1. Identify and include only the most important information
        2. Maintain factual accuracy - do not add or modify information
        3. Use clear, direct language
        4. Aim for approximately {self.max_words} words
        5. Preserve the original meaning and tone
        6. Include key details, dates, and figures when relevant
        7. Focus on the main points and conclusions
        8. Avoid redundancy and unnecessary elaboration

        RESPOND ONLY WITH THE SUMMARY TEXT. NO ADDITIONAL COMMENTARY.
        """

        result = await context.run_prediction(
            node_id=self.id,
            provider=Provider.Gemini,
            model=self.model.value,
            params={
                "contents": [self.text],
                "system_instruction": system_prompt,
                "config": {
                    "temperature": self.temperature,
                    "max_output_tokens": 8192,
                    "response_mime_type": "text/plain",
                },
            },
        )

        return result["candidates"][0]["content"]["parts"][0]["text"].strip()
