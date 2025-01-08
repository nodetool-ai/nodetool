import asyncio
from enum import Enum
from typing import Any
from pydantic import Field
from nodetool.metadata.types import (
    AudioRef,
    ImageRef,
    Message,
    MessageAudioContent,
    MessageContent,
    MessageImageContent,
    MessageTextContent,
    MessageVideoContent,
    Provider,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
import PIL.Image


class GeminiModel(str, Enum):
    Gemini1_5_Pro = "gemini-1.5-pro"
    Gemini1_5_Flash = "gemini-1.5-flash"
    Gemini2_0_Flash_Exp = "gemini-2.0-flash-exp"


class Gemini(BaseNode):
    """
    Generate text using Gemini.
    google, llm, chat, vision, multimodal
    """

    model: GeminiModel = Field(default=GeminiModel.Gemini1_5_Pro)
    prompt: str = Field(default="")
    messages: list[Message] = Field(
        default=[], description="History of messages to send to the model."
    )
    image: ImageRef = Field(
        default=ImageRef(), description="Image to use for generation"
    )
    audio: AudioRef = Field(
        default=AudioRef(), description="Audio to use for generation"
    )
    system_instruction: str = Field(
        default="You are a helpful assistant.",
        description="""Instructions for the model to steer it toward better performance.
        For example, "Answer as concisely as possible" or "Don't use technical
        terms in your response".
        """,
    )
    code_execution: bool = Field(
        default=False,
        description="""Whether to enable code execution tool. 
        You can use this code execution capability to build applications that 
        benefit from code-based reasoning and that produce text output.
        """,
    )
    temperature: float = Field(
        default=0.5,
        description="""Value that controls the degree of randomness in token selection.
        Lower temperatures are good for prompts that require a less open-ended or
        creative response, while higher temperatures can lead to more diverse or
        creative results.
        """,
    )
    top_p: float = Field(
        default=0.5,
        description="""Tokens are selected from the most to least probable until the sum
        of their probabilities equals this value. Use a lower value for less
        random responses and a higher value for more random responses.
        """,
    )
    top_k: float = Field(
        default=40,
        ge=1,
        le=50,
        description="""For each token selection step, the ``top_k`` tokens with the
        highest probabilities are sampled. Then tokens are further filtered based
        on ``top_p`` with the final token selected using temperature sampling. Use
        a lower number for less random responses and a higher number for more
        random responses.
        """,
    )
    max_output_tokens: int = Field(
        default=1024,
        description="""Maximum number of tokens that can be generated in the response.
      """,
    )
    presence_penalty: float = Field(
        default=0.0,
        description="""Positive values penalize tokens that already appear in the
        generated text, increasing the probability of generating more diverse
        content.
        """,
    )
    frequency_penalty: float = Field(
        default=0.0,
        description="""Positive values penalize tokens that repeatedly appear in the
        generated text, increasing the probability of generating more diverse
        content.
        """,
    )

    async def process(self, context: ProcessingContext) -> str:
        contents = []

        if self.image.is_set():
            image = await context.image_to_pil(self.image)
            contents.append(image)
        else:
            contents.append(self.prompt)

        if self.audio.is_set():
            audio = await context.asset_to_bytes(self.audio)
            contents.append({"mime_type": "audio/opus", "data": audio})

        messages = self.messages.copy()

        if not self.prompt.strip():
            if messages:
                contents = messages.pop().content
            else:
                raise ValueError("Prompt is required")

        async def get_content(
            content: MessageContent | str,
        ) -> str | PIL.Image.Image | dict[str, Any]:
            if isinstance(content, str):
                return content
            elif isinstance(content, MessageTextContent):
                return content.text
            elif isinstance(content, MessageImageContent):
                return await context.image_to_pil(content.image)
            elif isinstance(content, MessageAudioContent):
                return {
                    "mime_type": "audio/opus",
                    "data": await context.asset_to_bytes(content.audio),
                }
            elif isinstance(content, MessageVideoContent):
                raise ValueError("Video content is not supported")
            else:
                raise ValueError(f"Unsupported content type: {type(content)}")

        if messages:
            history = [
                {
                    "role": m.role,
                    "parts": await asyncio.gather(*[
                        get_content(c)
                        for c in (
                            m.content if isinstance(m.content, list) else [m.content]
                        )
                        if c is not None
                    ]) ,
                }
                for m in messages
            ]
        else:
            history = []

        response = await context.run_prediction(
            node_id=self.id,
            provider=Provider.Gemini,
            model=self.model.value,
            params={
                "contents": contents,
                "history": history,
                "system_instruction": self.system_instruction,
                "config": {
                    "temperature": self.temperature,
                    "top_p": self.top_p,
                    "top_k": self.top_k,
                    "max_output_tokens": self.max_output_tokens,
                    "presence_penalty": self.presence_penalty,
                    "frequency_penalty": self.frequency_penalty,
                },
            },
        )

        return response["candidates"][0]["content"]["parts"][0]["text"]
