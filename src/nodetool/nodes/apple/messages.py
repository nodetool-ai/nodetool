import subprocess
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import TextRef
from nodetool.nodes.apple import IS_MACOS
from nodetool.nodes.apple.notes import escape_for_applescript


class SendMessage(BaseNode):
    """
    Send messages using macOS Messages.app via AppleScript
    messages, imessage, automation, macos, communication

    Use cases:
    - Send automated notifications via iMessage
    - Integrate messaging into workflows
    - Send workflow results to yourself or others
    """

    recipient: str = Field(
        default="",
        description="Phone number, email, or contact name to send message to",
    )
    text: str = Field(default="", description="Message content to send")

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext):
        if not IS_MACOS:
            raise NotImplementedError("Messages functionality is only available on macOS")
        text_content = escape_for_applescript(self.text)
        recipient = escape_for_applescript(self.recipient)

        script = f"""
        tell application "Messages"
            set targetService to 1st service whose service type = iMessage
            set targetBuddy to buddy "{recipient}" of targetService
            send "{text_content}" to targetBuddy
        end tell
        """

        try:
            result = subprocess.run(
                ["osascript", "-e", script], check=True, capture_output=True, text=True
            )
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to send message: {e.stderr}")
