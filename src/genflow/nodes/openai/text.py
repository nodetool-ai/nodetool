import numpy as np
from genflow.metadata.types import Tensor
from genflow.metadata.types import TextRef
from genflow.common.environment import Environment
from genflow.workflows.genflow_node import GenflowNode
from genflow.common.openai_helpers import GPTModel
from genflow.workflows.processing_context import ProcessingContext


from openai.types.chat import ChatCompletion, ChatCompletionMessageParam
from pydantic import Field


from enum import Enum


class EmbeddingModel(str, Enum):
    TEXT_EMBEDDING_3_LARGE = "text-embedding-3-large"
    TEXT_EMBEDDING_3_SMALL = "text-embedding-3-small"
    TEXT_EMBEDDING_ADA_002 = "text-embedding-ada-002"


class CreateEmbedding(GenflowNode):
    """
    OpenAI’s text embeddings measure the relatedness of text strings. Embeddings are commonly used for:

    ## Applications
    - Search (where results are ranked by relevance to a query string)
    - Clustering (where text strings are grouped by similarity)
    - Recommendations (where items with related text strings are recommended)
    - Anomaly detection (where outliers with little relatedness are identified)
    - Diversity measurement (where similarity distributions are analyzed)
    - Classification (where text strings are classified by their most similar label)
    An embedding is a vector (list) of floating point numbers. The distance between two vectors measures their relatedness. Small distances suggest high relatedness and large distances suggest low relatedness.
    """

    input: str | TextRef = Field(title="Input", default="")
    model: EmbeddingModel = Field(
        title="Model", default=EmbeddingModel.TEXT_EMBEDDING_3_SMALL
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        client = Environment.get_openai_client()
        input = await context.to_str(self.input)
        if len(input) > 8192:
            # chunk the input into smaller pieces
            chunks = [input[i : i + 8192] for i in range(0, len(input), 8192)]
            res = await client.embeddings.create(input=chunks, model=self.model)
            all = [i.embedding for i in res.data]
            avg = np.mean(all, axis=0)
            return Tensor.from_numpy(avg)

        res = await client.embeddings.create(input=input, model=self.model)
        return Tensor(value=res.data[0].embedding)


class GPTNode(GenflowNode):
    """
    This node uses OpenAI's GPT (generative pre-trained transformer) models to understand and generate natural language responses.

    The ChatNode provides outputs based on provided input prompts. These prompts are considered the way of "programming" the GPT model. Typically, the model is given a set of instructions or examples of a task to be completed.

    #### Applications
    - Drafting documents: can be used to draft content automatically.
    - Writing computer code: can generate computer code text.
    - Answering questions about a knowledge base: can respond to inquiries about specific subjects.
    - Analyzing texts: can analyze and provide insights on given texts.
    - Creating conversational agents: can be used to build chatbots or other interactive systems.
    - Giving software a natural language interface: enables software to understand and respond to human language.
    - Tutoring in various subjects: can create responses and explanations for teaching purposes.
    - Translating languages: can translate text between different languages.
    - Simulating characters for games: can be used to generate dialogues for game characters.
    """

    class ResponseFormat(str, Enum):
        JSON_OBJECT = "json_object"
        TEXT = "text"

    model: GPTModel = Field(title="Model", default=GPTModel.GPT3)
    system: str = Field(title="System", default="You are a friendly assistant.")
    query: str = Field(title="Query", default="")
    presence_penalty: float = Field(
        title="Presence Penalty", default=0.0, ge=(-2.0), le=2.0
    )
    frequency_penalty: float = Field(
        title="Frequency Penalty", default=0.0, ge=(-2.0), le=2.0
    )
    temperature: float = Field(title="Temperature", default=1.0, ge=0.0, le=2.0)
    max_tokens: int = Field(title="Max Tokens", default=100, ge=1, le=2048)
    top_p: float = Field(title="Top P", default=1.0, ge=0.0, le=1.0)
    response_format: ResponseFormat = Field(
        title="Response Format", default=ResponseFormat.TEXT
    )

    async def process(self, context: ProcessingContext) -> str:
        messages: list[ChatCompletionMessageParam] = [
            {"role": "system", "content": self.system},
            {"role": "user", "content": self.query},
        ]
        client = Environment.get_openai_client()
        res: ChatCompletion = await client.chat.completions.create(
            model=self.model.value,
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            top_p=self.top_p,
            presence_penalty=self.presence_penalty,
            frequency_penalty=self.frequency_penalty,
            response_format={"type": self.response_format.value},
        )
        assert len(res.choices) > 0
        assert res.choices[0].message.content is not None
        return res.choices[0].message.content
