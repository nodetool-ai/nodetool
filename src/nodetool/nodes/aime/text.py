from enum import Enum
import json
from pydantic import Field
from nodetool.common.environment import Environment
from nodetool.metadata.types import Message, Provider
from nodetool.providers.aime.prediction import fetch_auth_key
from nodetool.providers.aime.types import Progress
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import NodeProgress


class AIMEChatModel(str, Enum):
    LLAMA3_1_CHAT = "llama3_1_chat"
    MIXTRAL_CHAT = "mixtral_chat"


class BaseChatNode(BaseNode):
    """Base class for AIME chat nodes with common fields"""

    @classmethod
    def is_visible(cls) -> bool:
        return cls != BaseChatNode

    system_prompt: str = Field(
        default="You are a friendly assistant.",
        description="System prompt that defines the assistant's behavior.",
    )
    messages: list[Message] = Field(
        default=[], description="History of messages in the conversation."
    )
    prompt: str = Field(
        default="",
        description="Prompt to send to the model. If provided, it will add a new message to the conversation.",
    )
    temperature: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="The temperature to use for response generation.",
    )
    top_k: int = Field(
        default=40,
        ge=1,
        description="The number of highest probability tokens to consider.",
    )
    top_p: float = Field(
        default=0.9,
        ge=0.0,
        le=1.0,
        description="The cumulative probability threshold for token sampling.",
    )
    max_tokens: int = Field(
        default=500,
        ge=1,
        description="Maximum number of tokens to generate.",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["messages", "prompt", "max_tokens"]

    async def predict(self, context: ProcessingContext, model: str) -> str:
        chat_messages = [{"role": "system", "content": self.system_prompt}]
        for msg in self.messages:
            chat_messages.append({"role": msg.role, "content": str(msg.content)})

        if self.prompt != "":
            chat_messages.append({"role": "user", "content": self.prompt})

        def progress_callback(progress: Progress):
            context.post_message(
                NodeProgress(
                    node_id=self._id,
                    progress=progress.progress,
                    total=100,
                )
            )

        payload = {
            "chat_context": json.dumps(chat_messages),
            "prompt_input": chat_messages[-1]["content"] if chat_messages else "",
            "top_k": self.top_k,
            "top_p": self.top_p,
            "temperature": self.temperature,
            "max_gen_tokens": self.max_tokens,
        }

        response = await context.run_prediction(
            node_id=self._id,
            provider=Provider.AIME,
            model=model,
            params={
                "data": payload,
                "progress_callback": progress_callback,
            },
        )

        return str(response.get("text", ""))


class Llama3Chat(BaseChatNode):
    """
    Run chat models using the Aime API with Llama 3.1.
    llm, text generation, language model, ai assistant

    Use cases:
    - Chat with an AI assistant using Llama 3.1
    - Generate responses for conversational workflows
    - Integrate with chat-based applications
    """

    async def process(self, context: ProcessingContext) -> str:
        return await self.predict(context, "llama3_1_chat")


class MixtralChat(BaseChatNode):
    """
    Run chat models using the Aime API with Mixtral.
    llm, text generation, language model, ai assistant

    Use cases:
    - Chat with an AI assistant using Mixtral
    - Generate responses for conversational workflows
    - Integrate with chat-based applications
    """

    async def process(self, context: ProcessingContext) -> str:
        return await self.predict(context, "mixtral_chat")
