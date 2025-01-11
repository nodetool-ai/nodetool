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

import tiktoken
from typing import List

def split_text_into_chunks(text: str, chunk_size: int, overlap: int, encoding_name: str = "cl100k_base") -> List[str]:
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
    token_chunks = [tokens[i:i + chunk_size] for i in range(0, len(tokens), step_size)]
    
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
        default="300",
        description="The number of seconds to keep the model alive.",
    )
    columns: RecordType = Field(
        default=RecordType(),
        description="The columns to use in the dataframe.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "prompt", "columns"]

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
        default="300",
        description="The number of seconds to keep the model alive.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "prompt"]

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
        le=4096 * 2,
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

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "prompt", "data"]

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


class QuestionAnswerAgent(BaseNode):
    """
    LLM Agent to generate answers based on a question and context from RAG results.
    llm, question-answering, RAG

    Use cases:
    - Answering questions using retrieved context
    - Generating coherent responses from multiple text sources
    - Knowledge-based Q&A systems
    """

    model: LlamaModel = Field(
        default=LlamaModel(),
        description="The Llama model to use for answer generation.",
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096 * 2,
        description="The context window size to use for the model.",
    )
    question: str = Field(
        default="",
        description="The question to answer",
    )
    context: list[str] = Field(
        default_factory=list,
        description="List of context strings from RAG retrieval",
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

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "prompt"]

    def requires_gpu(self) -> bool:
        return True

    async def process(self, context: ProcessingContext) -> str:
        # Join context passages with separators
        context_text = "\n\n---\n\n".join(self.context)

        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": """You are a helpful assistant that answers questions based on the provided context.
                        Use the context to formulate accurate and relevant answers.
                        If the context doesn't contain enough information to answer the question, acknowledge this limitation.
                        Provide specific references to the context when possible.""",
                    },
                    {
                        "role": "user",
                        "content": f"""Context:
                        {context_text}

                        Question: {self.question}

                        Please provide a clear and concise answer based on the context above.""",
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

        return str(res["message"]["content"])


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
        default="300",
        description="The number of seconds to keep the model alive.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "prompt", "schema"]

    def requires_gpu(self) -> bool:
        return True

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

    def requires_gpu(self) -> bool:
        return True

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
                    "num_ctx": self.context_window,
                },
            },
        )

        return str(res["message"]["content"]).strip()


class Summarizer(BaseNode):
    """
    LLM Agent to generate concise summaries of text content.
    llm, summarization, text processing

    Use cases:
    - Document summarization
    - Article abstraction
    - Content briefing
    - Key points extraction
    """

    model: LlamaModel = Field(
        default=LlamaModel(),
        description="The Llama model to use for summarization.",
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        le=4096*2,
        description="The context window size to use for the model.",
    )
    text: str = Field(
        default="",
        description="The text to summarize",
    )
    max_length: int = Field(
        default=200,
        ge=1,
        description="Target maximum length of the summary in words",
    )
    chunk_overlap: int = Field(
        default=100,
        ge=0,
        description="Number of tokens to overlap between chunks",
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
    system_prompt: str = Field(
        default="""You are an expert text summarizer. Follow these guidelines:

1. Content Focus:
   - Extract main arguments, findings, and conclusions
   - Preserve critical evidence and methodologies
   - Maintain factual accuracy and context
   - Include key statistics when relevant

2. Structure and Style:
   - Present information in logical flow
   - Use clear, precise language
   - Balance brevity with completeness
   - Adapt style to match source material

3. Quality Standards:
   - Include only information from the source
   - Avoid personal interpretation
   - Maintain technical accuracy
   - Preserve nuance in complex topics

Your goal is to create an accurate, useful, and efficient representation of the original text while maintaining its core meaning and significance.""",
        description="System prompt for the summarization task. Defines the behavior and guidelines for the summarization.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "text", "max_length", "system_prompt"]

    async def _summarize_chunk(
        self, context: ProcessingContext, text: str, is_final_summary: bool = False
    ) -> str:
        """Helper method to summarize a single chunk of text"""
        
        user_prompt = "Create a final summary:" if is_final_summary else "Summarize this section of text:"
        
        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": [
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": f"{user_prompt}\n\n{text}"},
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
        return str(res["message"]["content"]).strip()

    async def process(self, context: ProcessingContext) -> str:
        # Calculate effective context size (leaving room for prompts and completion)
        effective_context_size = int(self.context_window * 0.75)
        
        # Check if text needs chunking
        encoding = tiktoken.get_encoding("cl100k_base")
        total_tokens = len(encoding.encode(self.text))
        
        if total_tokens <= effective_context_size:
            # If text fits in context window, summarize directly
            return await self._summarize_chunk(context, self.text, True)
        
        # Split text into chunks
        chunks = split_text_into_chunks(
            self.text,
            chunk_size=effective_context_size,
            overlap=self.chunk_overlap
        )
        
        # Summarize each chunk
        chunk_summaries = []
        for chunk in chunks:
            summary = await self._summarize_chunk(context, chunk)
            chunk_summaries.append(summary)
        
        # Combine chunk summaries into final summary
        combined_summaries = "\n\n".join(chunk_summaries)
        
        # If combined summaries are still too long, recursively summarize
        if len(encoding.encode(combined_summaries)) > effective_context_size:
            return await self.process(context)  # Recursive call with combined summaries
        
        # Generate final summary
        return await self._summarize_chunk(context, combined_summaries, True)
