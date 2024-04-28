from enum import Enum
from pydantic import Field, validator
from nodetool.metadata.types import LlamaModel
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode


class GPT2(BaseNode):
    """
    GPT-2 is a transformer-based language model. This node uses the GPT-2 model to generate text based on a prompt.

    # Applications
    - Generating text based on a prompt.
    - Generating text for chatbots.
    - Generating text for creative writing.
    """

    prompt: str = Field(default="", description="Prompt to send to the model.")
    max_tokens: int = Field(
        default=128,
        ge=1,
        le=1024,
        description="Maximum number of tokens to generate. A word is generally 2-3 tokens (minimum: 1)",
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

    async def process(self, context: ProcessingContext) -> str:
        from transformers import pipeline

        pipe = pipeline(task="text-generation", model="gpt2")
        res = pipe(
            self.prompt,
            max_new_tokens=self.max_tokens,
            do_sample=True,
            temperature=self.temperature,
            top_k=self.top_k,
            top_p=self.top_p,
            return_full_text=False,
        )
        return res[0]["generated_text"]  # type: ignore


class LlamaCpp(BaseNode):
    """
    Run Llama models.
    """

    model: LlamaModel = Field(
        default=LlamaModel(), description="The Llama model to use."
    )
    prompt: str = Field(default="", description="Prompt to send to the model.")
    system_prompt: str = Field(
        default="You are an assistant.",
        description="System prompt to send to the model.",
    )
    max_tokens: int = Field(
        default=128,
        ge=1,
        le=1024,
        description="Maximum number of tokens to generate. A word is generally 2-3 tokens (minimum: 1)",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="The temperature to use for the model.",
    )
    n_gpu_layers: int = Field(
        default=0,
        ge=-1,
        le=100,
        description="Number of layers to offload to GPU (-ngl). If -1, all layers are offloaded.",
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
    grammar: str = Field(
        default="",
        description="The grammar to use for the model. If empty, no grammar is used.",
    )
    is_json_schema: bool = Field(
        default=False,
        description="Whether the grammar is a JSON schema. If true, the grammar is used as a JSON schema.",
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
        from llama_cpp import LlamaGrammar

        if self.grammar != "":
            if self.is_json_schema:
                grammar = LlamaGrammar.from_json_schema(self.grammar)
            else:
                grammar = LlamaGrammar.from_string(self.grammar)
        else:
            grammar = None

        llm = context.load_llama_model(self.model, n_gpu_layers=self.n_gpu_layers)

        if llm is None:
            raise ValueError(f"Model {self.model.name} not found.")

        res = llm.create_chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": self.system_prompt,
                },
                {"role": "user", "content": self.prompt},
            ],
            temperature=self.temperature,
            top_k=self.top_k,
            top_p=self.top_p,
            max_tokens=self.max_tokens,
            grammar=grammar,
        )
        return str(res["choices"][0]["message"]["content"])  # type: ignore
