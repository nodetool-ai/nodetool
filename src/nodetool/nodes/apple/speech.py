from enum import Enum
import subprocess
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import TextRef
from nodetool.nodes.apple.notes import escape_for_applescript


class SayText(BaseNode):
    """
    Speak text using macOS's built-in text-to-speech via AppleScript
    speech, automation, macos, accessibility

    Use cases:
    - Add voice notifications to workflows
    - Create audio feedback
    - Accessibility features
    """

    text: str | TextRef = Field(default="", description="Text to be spoken")
    rate: int = Field(default=175, description="Speaking rate (words per minute)")

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> bool:
        text_content = await context.text_to_str(self.text)
        text_content = escape_for_applescript(text_content)

        script = f"""
        tell application "System Events"
            set speechRate to {self.rate}
            say "{text_content}" speaking rate speechRate
        end tell
        """

        try:
            result = subprocess.run(
                ["osascript", "-e", script], check=True, capture_output=True, text=True
            )
            print(f"Subprocess output: {result.stdout}")
            print(f"Subprocess error: {result.stderr}")
            return True
        except subprocess.CalledProcessError as e:
            print(f"Subprocess failed with error: {e.stderr}")
            return False
