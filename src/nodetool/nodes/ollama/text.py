import asyncio
from enum import Enum
from typing import Mapping
from ollama import ChatResponse
from pydantic import Field, validator
from nodetool.metadata.types import (
    FunctionModel,
    ImageRef,
    LlamaModel,
    Message,
    MessageImageContent,
    MessageTextContent,
    Provider,
    NPArray,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import NodeProgress
from nodetool.chat.chat import Chunk, generate_messages


class Ollama(BaseNode):
    """
    Run Llama models to generate text responses.
    LLM, llama, text generation, language model, ai assistant

    Use cases:
    - Generate creative writing or stories
    - Answer questions or provide explanations
    - Assist with tasks like coding, analysis, or problem-solving
    - Engage in open-ended dialogue on various topics
    """

    model: LlamaModel = Field(
        default=LlamaModel(), description="The Llama model to use."
    )
    prompt: str = Field(default="", description="Prompt to send to the model.")
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The image to analyze",
    )
    system_prompt: str = Field(
        default="You are an assistant.",
        description="System prompt to send to the model.",
    )
    messages: list[Message] = Field(
        default=[], description="History of messages to send to the model."
    )
    context_window: int = Field(
        default=4096,
        ge=64,
        le=4096 * 16,
        description="The context window size to use for the model.",
    )
    num_predict: int = Field(
        default=4096,
        ge=1,
        le=10000,
        description="The number of tokens to predict.",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="The temperature to use for the model.",
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
    def get_basic_fields(cls):
        return ["model", "prompt", "image"]

    async def create_message(
        self, message: Message, context: ProcessingContext
    ) -> Mapping[str, str | list[str]]:
        ollama_message: dict[str, str | list[str]] = {
            "role": message.role,
        }

        if isinstance(message.content, list):
            ollama_message["content"] = "\n".join(
                content.text
                for content in message.content
                if isinstance(content, MessageTextContent)
            )
            ollama_message["images"] = await asyncio.gather(
                *[
                    context.image_to_base64(content.image)
                    for content in message.content
                    if isinstance(content, MessageImageContent)
                ]
            )
        else:
            ollama_message["content"] = str(message.content)

        return ollama_message

    async def process(self, context: ProcessingContext) -> str:
        if not self.messages and not self.prompt and not self.image.is_set():
            raise ValueError("Either messages, prompt, or image must be provided")

        messages: list[Message] = [
            Message(role="system", content=self.system_prompt),
        ]

        # Add existing messages if any
        if self.messages:
            messages.extend(self.messages)

        # Add prompt and image as final message if provided
        if self.prompt or self.image.is_set():
            content = []
            if self.image.is_set():
                image_base64 = await context.image_to_base64(self.image)
                content.append(
                    MessageImageContent(
                        image=ImageRef(uri=f"data:image/jpeg;base64,{image_base64}")
                    )
                )
            if self.prompt:
                content.append(MessageTextContent(text=self.prompt))

            messages.append(Message(role="user", content=content))

        model = FunctionModel(name=self.model.repo_id, provider=Provider.Ollama)
        result_content = ""

        async for chunk in generate_messages(
            messages=messages,
            model=model,
            options={
                "num_predict": self.num_predict,
                "top_p": self.top_p,
                "temperature": self.temperature,
                "top_k": self.top_k,
                "keep_alive": self.keep_alive,
                "num_ctx": self.context_window,
            },
        ):
            if isinstance(chunk, Chunk):
                context.post_message(
                    NodeProgress(
                        node_id=self._id,
                        progress=0,
                        total=0,
                        chunk=chunk.content,
                    )
                )
                result_content += chunk.content

        return result_content


class EmbeddingAggregation(Enum):
    MEAN = "mean"
    MAX = "max"
    MIN = "min"
    SUM = "sum"


class AggregateEmbeddings(BaseNode):
    """
    Aggregate embeddings into a single vector.

    Use cases:
    - Power semantic search capabilities
    - Enable text clustering and categorization
    - Support recommendation systems
    - Detect semantic anomalies or outliers
    - Measure text diversity or similarity
    - Aid in text classification tasks
    """

    model: LlamaModel = Field(title="Model", default=LlamaModel())
    chunks: list[str] = Field(
        title="Chunks",
        default=[],
        description="The chunks of text to embed.",
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        description="The context window size to use for the model.",
    )
    aggregation: EmbeddingAggregation = Field(
        default=EmbeddingAggregation.MEAN,
        description="The aggregation method to use for the embeddings.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "chunks"]

    async def process(self, context: ProcessingContext) -> NPArray:
        import numpy as np

        embeddings = []
        for chunk in self.chunks:
            res = await context.run_prediction(
                node_id=self._id,
                provider=Provider.Ollama,
                model=self.model.repo_id,
                params={"prompt": chunk, "options": {"num_ctx": self.context_window}},
            )
            embeddings.append(res["embedding"])

        if self.aggregation == EmbeddingAggregation.MEAN:
            aggregation = np.mean(embeddings, axis=0)
        elif self.aggregation == EmbeddingAggregation.MAX:
            aggregation = np.max(embeddings, axis=0)
        elif self.aggregation == EmbeddingAggregation.MIN:
            aggregation = np.min(embeddings, axis=0)
        elif self.aggregation == EmbeddingAggregation.SUM:
            aggregation = np.sum(embeddings, axis=0)
        else:
            raise ValueError(f"Invalid aggregation method: {self.aggregation}")

        return NPArray.from_numpy(aggregation)


class Embedding(BaseNode):
    """
    Generate vector representations of text for semantic similarity.
    embeddings, semantic analysis, text similarity, search, clustering

    Use cases:
    - Power semantic search capabilities
    - Enable text clustering and categorization
    - Support recommendation systems
    - Detect semantic anomalies or outliers
    - Measure text diversity or similarity
    - Aid in text classification tasks
    """

    input: str = Field(title="Input", default="")
    model: LlamaModel = Field(title="Model", default=LlamaModel())
    context_window: int = Field(
        default=4096,
        ge=1,
        description="The context window size to use for the model.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "input"]

    async def process(self, context: ProcessingContext) -> NPArray:
        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={"prompt": self.input, "options": {"num_ctx": self.context_window}},
        )
        return NPArray.from_numpy(res["embedding"])
