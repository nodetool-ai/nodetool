from enum import Enum
from pydantic import Field
from genflow.workflows.processing_context import ProcessingContext
from genflow.workflows.genflow_node import GenflowNode


from pydantic import Field
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import DataFrame
from genflow.metadata.types import TextRef
from genflow.workflows.genflow_node import GenflowNode


class GPT2Node(GenflowNode):
    """
    ## GPT2 Node
    ### Namespace: Text.Generate
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


class TinyLlama(GenflowNode):
    system_prompt: str = Field(
        default="You are a friendly chatbot who always responds in the style of a pirate.",
        description="System prompt to send to the model.",
    )
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
        import torch
        from transformers import pipeline

        pipe = pipeline(
            "text-generation",
            model="TinyLlama/TinyLlama-1.1B-Chat-v1.0",
            torch_dtype=torch.bfloat16,
            device_map="auto",
        )
        messages = [
            {
                "role": "system",
                "content": self.system_prompt,
            },
            {"role": "user", "content": self.prompt},
        ]
        assert pipe.tokenizer is not None
        prompt = pipe.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

        res = pipe(
            prompt,
            max_new_tokens=self.max_tokens,
            do_sample=True,
            temperature=self.temperature,
            top_k=self.top_k,
            top_p=self.top_p,
            return_full_text=False,
        )
        return res[0]["generated_text"]  # type: ignore


class LlamaModel(str, Enum):
    Qwen_0_5 = "Qwen1.5-0.5B-Chat"
    Qwen_1_8 = "Qwen1.5-1.8B-Chat"
    Qwen_4_0 = "Qwen1.5-4.0B-Chat"
    Qwen_7_0 = "Qwen1.5-7.0B-Chat"
    Mistral_7B_Instruct = "Mistral_7B_Instruct"
    Mistral_8x_7B_Instruct = "Mistral_8x_7B_Instruct"
    CapybaraHermes_2_5_Mistral_7B = "CapybaraHermes-2.5-Mistral-7B"
    Dolphin_2_5_Mixtral_8x7B = "dolphin-2.5-mixtral-8x7b"
    Zephyr_7B = "Zephyr-7B"


llama_models = {
    LlamaModel.Qwen_0_5: {
        "repo_id": "Qwen/Qwen1.5-0.5B-Chat-GGUF",
        "filename": "*q8_0.gguf",
    },
    LlamaModel.Qwen_1_8: {
        "repo_id": "Qwen/Qwen1.5-1.8B-Chat-GGUF",
        "filename": "*q8_0.gguf",
    },
    LlamaModel.Qwen_4_0: {
        "repo_id": "Qwen/Qwen1.5-4.0B-Chat-GGUF",
        "filename": "*q8_0.gguf",
    },
    LlamaModel.Qwen_7_0: {
        "repo_id": "Qwen/Qwen1.5-7.0B-Chat-GGUF",
        "filename": "*q4_0.gguf",
    },
    LlamaModel.Mistral_7B_Instruct: {
        "repo_id": "TheBloke/Mistral-7B-Instruct-v0.1-GGUF",
        "filename": "*Q4_0.gguf",
    },
    LlamaModel.Mistral_8x_7B_Instruct: {
        "repo_id": "TheBloke/Mistral-8x-7B-Instruct-v0.1-GGUF",
        "filename": "*Q2_K.gguf",
    },
    LlamaModel.CapybaraHermes_2_5_Mistral_7B: {
        "repo_id": "TheBloke/CapybaraHermes-2.5-Mistral-7B-GGUF",
        "filename": "*Q4_0.gguf",
    },
    LlamaModel.Dolphin_2_5_Mixtral_8x7B: {
        "repo_id": "TheBloke/Dolphin-2.5-Mixtral-8x7B-GGUF",
        "filename": "*Q2_K.gguf",
    },
    LlamaModel.Zephyr_7B: {
        "repo_id": "TheBloke/zephyr-7B-beta-GGUF",
        "filename": "*Q4_0.gguf",
    },
}

cached_models = {}


class LlamaCppNode(GenflowNode):
    """
    Run Llama models.
    """

    model: LlamaModel = Field(
        default=LlamaModel.Qwen_0_5, description="The Llama model to use."
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

    async def process(self, context: ProcessingContext) -> str:
        from llama_cpp import LlamaGrammar
        from llama_cpp import Llama

        repo_id = llama_models[self.model]["repo_id"]
        filename = llama_models[self.model]["filename"]

        if self.grammar != "":
            if self.is_json_schema:
                grammar = LlamaGrammar.from_json_schema(self.grammar)
            else:
                grammar = LlamaGrammar.from_string(self.grammar)
        else:
            grammar = None

        if self.model in cached_models:
            llm = cached_models[self.model]
        else:
            llm = Llama.from_pretrained(
                repo_id=repo_id, filename=filename, verbose=True
            )
            cached_models[self.model] = llm

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
