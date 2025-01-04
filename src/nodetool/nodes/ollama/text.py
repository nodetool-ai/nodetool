import asyncio
from typing import Mapping
from pydantic import Field, validator
from nodetool.metadata.types import (
    ImageRef,
    LlamaModel,
    Message,
    MessageImageContent,
    MessageTextContent,
    Provider,
    Tensor,
    TextRef,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class Ollama(BaseNode):
    """
    Run Llama models to generate text responses.
    llama, text generation, language model, ai assistant

    Use cases:
    - Generate creative writing or stories
    - Answer questions or provide explanations
    - Assist with tasks like coding, analysis, or problem-solving
    - Engage in open-ended dialogue on various topics
    """

    model: LlamaModel = Field(
        default=LlamaModel(), description="The Llama model to use."
    )
    system_prompt: str = Field(
        default="You are an assistant.",
        description="System prompt to send to the model.",
    )
    prompt: str = Field(default="", description="Prompt to send to the model.")
    messages: list[Message] = Field(
        default=[], description="History of messages to send to the model."
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The image to analyze",
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        description="The context window size to use for the model.",
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
        default="300",
        description="The number of seconds to keep the model alive.",
    )

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

        messages: list[Mapping[str, str | list[str]]] = [
            {
                "role": "system",
                "content": self.system_prompt,
            },
        ]

        # Add existing messages if any
        if self.messages:
            message_dicts = await asyncio.gather(
                *[self.create_message(message, context) for message in self.messages]
            )
            messages.extend(message_dicts)

        # Add prompt and image as final message if provided
        if self.prompt or self.image.is_set():
            user_message: dict[str, str | list[str]] = {
                "role": "user",
                "content": self.prompt,
            }
            if self.image.is_set():
                image_base64 = await context.image_to_base64(self.image)
                user_message["images"] = [image_base64]
            messages.append(user_message)

        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.repo_id,
            params={
                "messages": messages,
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
                    "keep_alive": self.keep_alive,
                    "num_ctx": self.context_window,
                },
            },
        )

        return str(res["message"]["content"])


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

    input: str | TextRef = Field(title="Input", default="")
    model: LlamaModel = Field(title="Model", default=LlamaModel())
    context_window: int = Field(
        default=4096,
        ge=1,
        description="The context window size to use for the model.",
    )
    chunk_size: int = Field(
        title="Chunk Size",
        default=4096,
        ge=64,
        description="The size of the chunks to split the input into",
    )

    def requires_gpu(self) -> bool:
        return True

    async def process(self, context: ProcessingContext) -> Tensor:
        import numpy as np

        input = await context.text_to_str(self.input)
        # chunk the input into smaller pieces
        chunks = [
            input[i : i + self.chunk_size]
            for i in range(0, len(input), self.chunk_size)
        ]
        embeddings = []
        for chunk in chunks:
            res = await context.run_prediction(
                node_id=self._id,
                provider=Provider.Ollama,
                model=self.model.repo_id,
                params={"prompt": chunk, "options": {"num_ctx": self.context_window}},
            )
            embeddings.append(res["embedding"])

        avg = np.mean(embeddings, axis=0)
        return Tensor.from_numpy(avg)
