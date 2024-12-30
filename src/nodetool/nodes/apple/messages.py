import subprocess
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import TextRef
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


class ReadMessages(BaseNode):
    """
    Read recent messages from macOS Messages.app via AppleScript
    messages, imessage, automation, macos, communication

    Use cases:
    - Monitor conversations
    - Process incoming messages in workflows
    - Extract message content for automation
    """

    contact: str = Field(
        default="",
        description="Optional contact name/number to filter messages (empty for all recent)",
    )
    limit: int = Field(
        default=10, description="Maximum number of recent messages to retrieve"
    )

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> list[dict]:
        contact = escape_for_applescript(self.contact)

        script = f"""
        tell application "Messages"
            set messageData to {{}}
            
            if "{contact}" is "" then
                set recentChats to chats
            else
                set recentChats to (chats where name contains "{contact}")
            end if
            
            -- Check if we have any chats before trying to process them
            if (count of recentChats) > 0 then
                set chatLimit to minimum of {self.limit} and (count of recentChats)
                repeat with i from 1 to chatLimit
                    set currentChat to item i of recentChats
                    try
                        set messageList to messages of currentChat
                        set chatName to name of currentChat
                        
                        repeat with currentMessage in messageList
                            set messageText to content of currentMessage
                            set messageSender to sender of currentMessage
                            set messageTime to date received of currentMessage
                            
                            set end of messageData to {{chatName, messageSender, messageText, messageTime}}
                        end repeat
                    end try
                end repeat
            end if
            
            return messageData
        end tell
        """

        try:
            result = subprocess.run(
                ["osascript", "-e", script], check=True, capture_output=True, text=True
            )

            messages = []
            if result.stdout.strip():
                raw_items = result.stdout.strip().split("}, {")
                for item in raw_items:
                    item = item.replace("{", "").replace("}", "").strip()
                    if item:
                        chat, sender, text, timestamp = [
                            part.strip().strip('"') for part in item.split(",", 3)
                        ]
                        messages.append(
                            {
                                "chat": chat,
                                "sender": sender,
                                "text": text,
                                "timestamp": timestamp,
                            }
                        )

            return messages
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to read messages: {e.stderr}")
