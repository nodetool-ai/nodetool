import tiktoken
from nodetool.nodes.replicate import ReplicateNode, calculate_llm_cost

from pydantic import Field
from enum import Enum

from nodetool.nodes.replicate import get_model_version
from nodetool.workflows.processing_context import ProcessingContext


class LlamaNode(ReplicateNode):
    """
    Llama is a tool for generating text based on a given prompt.

    This model, developed by Meta, creates vivid and context-specific textual outputs.

    #### Applications
    - Story writing: Create high-quality stories, articles or scripts.
    - Dialogue system: Develop advanced customer service chatbots or characters for video games.
    - Education: Craft personalized learning resources or assist with homework.
    - Business: Generate market analysis reports or help with technical writing.
    """

    class Model(str, Enum):
        llama_3_8b = "meta/meta-llama-3-8b"
        llama_3_13b = "meta/meta-llama-3-13b"
        llama_3_70b = "meta/meta-llama-3-70b"
        llama_3_8b_chat = "meta/meta-llama-3-8b-instruct"
        llama_3_13b_chat = "meta/meta-llama-3-13b-chat"
        llama_3_70b_chat = "meta/meta-llama-3-70b-chat"
        mistral_7b = "mistralai/mistral-7b-v0.1"

    model: Model = Field(
        default=Model.llama_3_8b,
        description="The version of the model to use.",
    )

    prompt: str = Field(default="", description="Prompt to send to the model.")
    system_prompt: str = Field(
        default="",
        description="Prompt to instruct the model. Only works for instruct models.",
    )
    max_new_tokens: int = Field(
        default=128,
        ge=1,
        le=1024,
        description="Maximum number of tokens to generate. A word is generally 2-3 tokens (minimum: 1)",
    )
    min_new_tokens: int = Field(
        default=(-1),
        ge=(-1),
        le=10,
        description="Minimum number of tokens to generate. To disable, set to -1. A word is generally 2-3 tokens. (minimum: -1)",
    )
    temperature: float = Field(
        default=0.75,
        ge=0.01,
        le=5,
        description="Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value. (minimum: 0.01; maximum: 5)",
    )
    top_p: float = Field(
        default=0.9,
        ge=0,
        le=1,
        description="When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens (maximum: 1)",
    )
    stop_sequences: str = Field(
        default="<end>,<stop>",
        description="A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'.",
    )

    async def process(self, context: ProcessingContext) -> str:
        enc = tiktoken.encoding_for_model("gpt-4")
        input_tokens = enc.encode(self.prompt)

        if self.system_prompt == "":
            prompt_template = "{prompt}"
        else:
            prompt_template = """
                <|begin_of_text|><|start_header_id|>system<|end_header_id|>
                You are a helpful assistant<|eot_id|><|start_header_id|>user<|end_header_id|>
                {prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>
            """

        pred = await self.run_replicate(context, {"prompt_template": prompt_template})
        if pred is None:
            raise ValueError("Prediction failed")
        output_tokens = pred.output or []
        cost = calculate_llm_cost(
            self.model.value, len(input_tokens), len(output_tokens)
        )
        await context.create_prediction(
            provider="replicate",
            node_id=self.id,
            node_type=self.get_node_type(),
            model=self.model.value,
            cost=cost,
        )
        return "".join(output_tokens)

    def replicate_model_id(self) -> str:
        return f"{self.model.value}:{get_model_version(self.model.value)}"
