import subprocess
from datetime import datetime
from pydantic import Field
from nodetool.metadata.types import Datetime
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.apple.notes import escape_for_applescript


class CreateCalendarEvent(BaseNode):
    """
    Create a new event in Apple Calendar via AppleScript
    calendar, automation, macos, productivity

    Use cases:
    - Automate event creation
    - Schedule meetings programmatically
    - Create recurring events
    """

    title: str = Field(default="New Event", description="Title of the calendar event")
    start_date: Datetime = Field(
        default=Datetime(),
        description="Start date and time of the event",
    )
    end_date: Datetime = Field(
        default=Datetime(),
        description="End date and time of the event",
    )
    calendar_name: str = Field(default="Calendar", description="Name of the calendar")
    location: str = Field(default="", description="Location of the event")
    description: str = Field(default="", description="Description/notes for the event")

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["title", "start_date", "end_date", "calendar_name"]

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext):
        title = escape_for_applescript(self.title)
        location = escape_for_applescript(self.location)
        description = escape_for_applescript(self.description)

        # Update date format to match "Thursday, 28 December 2024 10:00:00"
        start_date = self.start_date.to_datetime().strftime("%A, %d %B %Y %H:%M:%S")
        end_date = self.end_date.to_datetime().strftime("%A, %d %B %Y %H:%M:%S")

        script = f"""
        tell application "Calendar"
            tell calendar "{self.calendar_name}"
                make new event with properties {{summary:"{title}", start date:date "{start_date}", end date:date "{end_date}", location:"{location}", description:"{description}"}}
            end tell
        end tell
        """

        try:
            result = subprocess.run(
                ["osascript", "-e", script], check=True, capture_output=True, text=True
            )
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to create calendar event: {e.stderr}")
