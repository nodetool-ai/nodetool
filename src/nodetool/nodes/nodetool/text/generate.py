from enum import Enum
import os
from pydantic import Field
from nodetool.common.environment import Environment
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode


from pydantic import Field
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode


class GPT2Node(BaseNode):
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


class LlamaModel(str, Enum):
    PHI_2 = "Phi-2"
    GEMMA_2B = "Gemma-2B"
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
    LlamaModel.PHI_2: {
        "repo_id": "TheBloke/phi-2-GGUF",
        "filename": "*Q4_K_S.gguf",
    },
    LlamaModel.GEMMA_2B: {
        "repo_id": "lmstudio-ai/gemma-2b-it-GGUF",
        "filename": "*q8_0.gguf",
    },
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


def find_model_in_cache(model_id: str):
    """
    Tries to find the model in common cached folders, such as LM Studio.

    Args:
        model_id (str): The model ID.

    Returns:
        str | None: The path to the model file, or None if the model is not found.
    """
    cache_path = Environment.get_lm_studio_folder()
    model_dir = os.path.join(cache_path, model_id)
    if os.path.isdir(model_dir):
        files = os.listdir(model_dir)
        if len(files) > 0:
            return os.path.join(model_dir, files[0])
    return None


class LlamaCppNode(BaseNode):
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

    def load_model(self, repo_id: str, filename: str):
        from llama_cpp import Llama

        model_path = find_model_in_cache(repo_id)
        if model_path:
            llm = Llama(model_path=model_path, n_gpu_layers=self.n_gpu_layers)
        else:
            llm = Llama.from_pretrained(
                repo_id=repo_id, filename=filename, n_gpu_layers=self.n_gpu_layers
            )
        cached_models[self.model] = llm
        return llm

    async def process(self, context: ProcessingContext) -> str:
        from llama_cpp import LlamaGrammar

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
            gpu_layers = 0x7FFFFFFF if self.n_gpu_layers == -1 else self.n_gpu_layers
            if llm.model_params.n_gpu_layers != gpu_layers:
                llm = self.load_model(repo_id, filename)
        else:
            llm = self.load_model(repo_id, filename)

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
