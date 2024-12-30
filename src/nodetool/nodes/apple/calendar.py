import subprocess
from datetime import datetime
from pydantic import Field
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
    start_date: datetime = Field(
        default_factory=datetime.now, description="Start date and time of the event"
    )
    end_date: datetime = Field(
        default_factory=lambda: datetime.now().replace(hour=datetime.now().hour + 1),
        description="End date and time of the event",
    )
    calendar_name: str = Field(default="Calendar", description="Name of the calendar")
    location: str = Field(default="", description="Location of the event")
    description: str = Field(default="", description="Description/notes for the event")

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext):
        title = escape_for_applescript(self.title)
        location = escape_for_applescript(self.location)
        description = escape_for_applescript(self.description)

        # Update date format to match "Thursday, 28 December 2024 10:00:00"
        start_date = self.start_date.strftime("%A, %d %B %Y %H:%M:%S")
        end_date = self.end_date.strftime("%A, %d %B %Y %H:%M:%S")

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


class ReadCalendarEvents(BaseNode):
    """
    Read events from Apple Calendar via AppleScript
    calendar, automation, macos, productivity

    Use cases:
    - Monitor upcoming events
    - Process calendar data in workflows
    - Extract event information
    """

    calendar_name: str = Field(default="Calendar", description="Name of the calendar")
    days_ahead: int = Field(
        default=7, description="Number of days ahead to fetch events"
    )
    search_term: str = Field(
        default="", description="Optional search term to filter events"
    )

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> list[dict]:
        search_term = escape_for_applescript(self.search_term)

        script = f"""
        tell application "Calendar"
            tell calendar "{self.calendar_name}"
                set startDate to current date
                set endDate to (current date) + ({self.days_ahead} * days)
                
                set eventList to {{}}
                if "{search_term}" is "" then
                    set eventList to (every event whose start date is greater than or equal to startDate and start date is less than or equal to endDate)
                else
                    set eventList to (every event whose start date is greater than or equal to startDate and start date is less than or equal to endDate and (summary contains "{search_term}" or location contains "{search_term}"))
                end if
                
                set eventData to {{}}
                repeat with currentEvent in eventList
                    set eventProps to {{summary of currentEvent, start date of currentEvent, end date of currentEvent, location of currentEvent, description of currentEvent}}
                    set end of eventData to eventProps
                end repeat
                
                return eventData
            end tell
        end tell
        """

        try:
            result = subprocess.run(
                ["osascript", "-e", script], check=True, capture_output=True, text=True
            )

            events = []
            if result.stdout.strip():
                raw_items = result.stdout.strip().split("}, {")
                for item in raw_items:
                    item = item.replace("{", "").replace("}", "").strip()
                    if item:
                        title, start, end, location, description = [
                            part.strip().strip('"') for part in item.split(",", 4)
                        ]
                        # Convert the dates to the required format
                        try:
                            start_date = datetime.strptime(
                                start, "%Y-%m-%d %H:%M:%S +0000"
                            ).strftime("%A, %B %d, %Y at %I:%M:%S %p")
                            end_date = datetime.strptime(
                                end, "%Y-%m-%d %H:%M:%S +0000"
                            ).strftime("%A, %B %d, %Y at %I:%M:%S %p")
                        except ValueError:
                            # Fallback in case the date format is different
                            start_date = start
                            end_date = end

                        events.append(
                            {
                                "title": title,
                                "start_date": start_date,
                                "end_date": end_date,
                                "location": location,
                                "description": description,
                            }
                        )

            return events
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to read calendar events: {e.stderr}")
