from enum import Enum
import AppKit
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import TextRef


class SayText(BaseNode):
    """
    Speak text using macOS's built-in text-to-speech
    speech, automation, macos, accessibility

    Use cases:
    - Add voice notifications to workflows
    - Create audio feedback
    - Accessibility features
    """

    text: str = Field(default="", description="Text to be spoken")
    rate: int = Field(default=175, description="Speaking rate (not implemented)")

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> bool:
        try:
            synthesizer = AppKit.NSSpeechSynthesizer.alloc().init()  # type: ignore
            synthesizer.startSpeakingString_(self.text)
            return True
        except Exception as e:
            print(f"Speech synthesis failed with error: {e}")
            return False
