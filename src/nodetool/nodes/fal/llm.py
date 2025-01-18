from enum import Enum
from pydantic import Field
from nodetool.nodes.fal.fal_node import FALNode
from nodetool.workflows.processing_context import ProcessingContext


class ModelEnum(str, Enum):
    CLAUDE_3_SONNET = "anthropic/claude-3.5-sonnet"
    CLAUDE_3_HAIKU = "anthropic/claude-3-5-haiku"
    CLAUDE_3_HAIKU_LEGACY = "anthropic/claude-3-haiku"
    GEMINI_PRO = "google/gemini-pro-1.5"
    GEMINI_FLASH = "google/gemini-flash-1.5"
    GEMINI_FLASH_8B = "google/gemini-flash-1.5-8b"
    LLAMA_1B = "meta-llama/llama-3.2-1b-instruct"
    LLAMA_3B = "meta-llama/llama-3.2-3b-instruct"
    LLAMA_8B = "meta-llama/llama-3.1-8b-instruct"
    LLAMA_70B = "meta-llama/llama-3.1-70b-instruct"
    GPT4_MINI = "openai/gpt-4o-mini"
    GPT4 = "openai/gpt-4o"


class AnyLLM(FALNode):
    """
    Use any large language model from a selected catalogue (powered by OpenRouter).
    Supports various models including Claude 3, Gemini, Llama, and GPT-4.
    llm, text, generation, ai, language

    Use cases:
    - Generate natural language responses
    - Create conversational AI interactions
    - Process and analyze text content
    - Generate creative writing
    - Assist with problem-solving tasks
    """

    prompt: str = Field(
        default="", description="The prompt to send to the language model"
    )
    system_prompt: str = Field(
        default="",
        description="Optional system prompt to provide context or instructions",
    )
    model: ModelEnum = Field(
        default=ModelEnum.GEMINI_FLASH,
        description="The language model to use for the completion",
    )

    async def process(self, context: ProcessingContext) -> str:
        """
        Process the prompt using the selected language model.

        Returns:
            dict: Contains the generated output text and status information
        """
        arguments = {"prompt": self.prompt, "model": self.model.value}

        if self.system_prompt:
            arguments["system_prompt"] = self.system_prompt

        result = await self.submit_request(
            context=context, application="fal-ai/any-llm", arguments=arguments
        )

        return result["output"]

    @classmethod
    def get_basic_fields(cls):
        return ["prompt", "model", "system_prompt"]
