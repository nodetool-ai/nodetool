import numpy as np
from nodetool.metadata.types import (
    ImageRef,
    Message,
    MessageImageContent,
    MessageTextContent,
    OpenAIModel,
    Provider,
    NPArray,
)
from nodetool.metadata.types import TextRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.chat.chat import Chunk, generate_messages, process_messages
from nodetool.metadata.types import FunctionModel, Provider


from openai.types.chat import ChatCompletion, ChatCompletionMessageParam
from openai.types.create_embedding_response import CreateEmbeddingResponse
from pydantic import Field

from enum import Enum

from nodetool.workflows.types import NodeProgress


class EmbeddingModel(str, Enum):
    TEXT_EMBEDDING_3_LARGE = "text-embedding-3-large"
    TEXT_EMBEDDING_3_SMALL = "text-embedding-3-small"


class ResponseFormat(str, Enum):
    JSON_OBJECT = "json_object"
    TEXT = "text"


class Embedding(BaseNode):
    """
    Generate vector representations of text for semantic analysis.
    embeddings, similarity, search, clustering, classification

    Uses OpenAI's embedding models to create dense vector representations of text.
    These vectors capture semantic meaning, enabling:
    - Semantic search
    - Text clustering
    - Document classification
    - Recommendation systems
    - Anomaly detection
    - Measuring text similarity and diversity
    """

    input: str = Field(title="Input", default="")
    model: EmbeddingModel = Field(
        title="Model", default=EmbeddingModel.TEXT_EMBEDDING_3_SMALL
    )
    chunk_size: int = 4096

    async def process(self, context: ProcessingContext) -> NPArray:
        # chunk the input into smaller pieces
        chunks = [
            self.input[i : i + self.chunk_size]
            for i in range(0, len(self.input), self.chunk_size)
        ]

        response = await context.run_prediction(
            self.id,
            provider=Provider.OpenAI,
            params={"input": chunks},
            model=self.model.value,
        )

        res = CreateEmbeddingResponse(**response)

        all = [i.embedding for i in res.data]
        avg = np.mean(all, axis=0)
        return NPArray.from_numpy(avg)


class OpenAIText(BaseNode):
    """
    Generate natural language responses using OpenAI models.
    llm, text-generation, chatbot, question-answering

    Leverages OpenAI's GPT models to:
    - Generate human-like text responses
    - Answer questions
    - Complete prompts
    - Engage in conversational interactions
    - Assist with writing and editing tasks
    - Perform text analysis and summarization
    """

    @classmethod
    def get_title(cls) -> str:
        return "OpenAI Text"

    model: OpenAIModel = Field(title="Model", default=OpenAIModel(id="o3-mini"))
    system: str = Field(title="System", default="You are a friendly assistant.")
    prompt: str = Field(title="Prompt", default="")
    messages: list[Message] = Field(title="Messages", default=[])
    image: ImageRef = Field(title="Image", default=ImageRef())
    presence_penalty: float = Field(
        title="Presence Penalty", default=0.0, ge=(-2.0), le=2.0
    )
    frequency_penalty: float = Field(
        title="Frequency Penalty", default=0.0, ge=(-2.0), le=2.0
    )
    max_tokens: int = Field(title="Max Tokens", default=4096, ge=1, le=100000)
    top_p: float = Field(title="Top P", default=1.0, ge=0.0, le=1.0)

    async def process(self, context: ProcessingContext) -> str:
        content = []
        if not self.image.is_empty():
            base64_image = await context.image_to_base64(self.image)
            content.append(
                MessageImageContent(
                    image=ImageRef(uri=f"data:image/jpeg;base64,{base64_image}")
                )
            )

        content.append(MessageTextContent(text=self.prompt))

        messages = [
            Message(role="system", content=self.system),
        ]

        for message in self.messages:
            messages.append(message)

        messages.append(Message(role="user", content=content))

        model = FunctionModel(name=self.model.id, provider=Provider.OpenAI)

        result_content = ""

        # Use generate_messages instead of process_messages
        async for chunk in generate_messages(
            messages=messages,
            model=model,
            max_tokens=self.max_tokens,
            top_p=self.top_p,
            presence_penalty=self.presence_penalty,
            frequency_penalty=self.frequency_penalty,
        ):
            if isinstance(chunk, Chunk):
                # Send chunk via context.post_message
                context.post_message(
                    NodeProgress(
                        node_id=self.id,
                        progress=0,
                        total=0,
                        chunk=chunk.content,
                    )
                )
                result_content += chunk.content

        return result_content

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["prompt", "model", "temperature"]
