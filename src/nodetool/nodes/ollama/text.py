from pydantic import Field, validator
from nodetool.metadata.types import LlamaModel, Provider, Tensor, TextRef
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
    prompt: str = Field(default="", description="Prompt to send to the model.")
    system_prompt: str = Field(
        default="You are an assistant.",
        description="System prompt to send to the model.",
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

    @validator("model", pre=True)
    def validate_model(cls, v):
        if isinstance(v, str):
            v = LlamaModel(name=v)
        if isinstance(v, dict):
            v = LlamaModel(**v)
        if v.name == "":
            raise ValueError("The model cannot be empty.")
        return v

    async def process(self, context: ProcessingContext) -> str:
        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.Ollama,
            model=self.model.name,
            params={
                "messages": [
                    {
                        "role": "system",
                        "content": self.system_prompt,
                    },
                    {"role": "user", "content": self.prompt},
                ],
                "options": {
                    "temperature": self.temperature,
                    "top_k": self.top_k,
                    "top_p": self.top_p,
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
    chunk_size: int = Field(
        title="Chunk Size",
        default=4096,
        ge=64,
        description="The size of the chunks to split the input into",
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        import numpy as np

        input = await context.to_str(self.input)
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
                model=self.model.name,
                params={"prompt": chunk},
            )
            embeddings.append(res["embedding"])

        avg = np.mean(embeddings, axis=0)
        return Tensor.from_numpy(avg)
