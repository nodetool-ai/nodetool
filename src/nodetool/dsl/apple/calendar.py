from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CreateCalendarEvent(GraphNode):
    """
    Create a new event in Apple Calendar via AppleScript
    calendar, automation, macos, productivity

    Use cases:
    - Automate event creation
    - Schedule meetings programmatically
    - Create recurring events
    """

    title: str | GraphNode | tuple[GraphNode, str] = Field(default='New Event', description='Title of the calendar event')
    start_date: Datetime | GraphNode | tuple[GraphNode, str] = Field(default=Datetime(type='datetime', year=0, month=0, day=0, hour=0, minute=0, second=0, microsecond=0, tzinfo='UTC', utc_offset=0), description='Start date and time of the event')
    end_date: Datetime | GraphNode | tuple[GraphNode, str] = Field(default=Datetime(type='datetime', year=0, month=0, day=0, hour=0, minute=0, second=0, microsecond=0, tzinfo='UTC', utc_offset=0), description='End date and time of the event')
    calendar_name: str | GraphNode | tuple[GraphNode, str] = Field(default='Calendar', description='Name of the calendar')
    location: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Location of the event')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Description/notes for the event')

    @classmethod
    def get_node_type(cls): return "apple.calendar.CreateCalendarEvent"



class ListCalendarEvents(GraphNode):
    """
    List events from Apple Calendar within a specified date range
    calendar, automation, macos, productivity

    Use cases:
    - Retrieve upcoming events
    - Check schedule availability
    - Export calendar events
    """

    days_back: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Number of days to look back from today')
    days_forward: int | GraphNode | tuple[GraphNode, str] = Field(default=7, description='Number of days to look forward from today')
    calendar_name: str | GraphNode | tuple[GraphNode, str] = Field(default='Calendar', description='Name of the calendar to search')

    @classmethod
    def get_node_type(cls): return "apple.calendar.ListCalendarEvents"


