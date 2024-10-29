import json

from pydantic import Field
from nodetool.metadata.types import (
    DataframeRef,
    LlamaModel,
    Provider,
    RecordType,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Message


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
                    {"role": "user", "content": self.prompt + ". Respond using JSON."},
                ],
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "stream": False,
                    "format": "json",
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
