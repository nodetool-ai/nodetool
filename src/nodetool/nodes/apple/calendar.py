from datetime import datetime
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Datetime, CalendarEvent
from nodetool.nodes.apple import IS_MACOS

if IS_MACOS:
    import EventKit  # type: ignore
    import Foundation  # type: ignore

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
        if not IS_MACOS:
            raise NotImplementedError("Calendar functionality is only available on macOS")
        # Get the event store
        event_store = EventKit.EKEventStore.alloc().init()  # type: ignore

        # Request calendar acces
        event_store.requestAccessToEntityType_completion_(  # type: ignore
            EventKit.EKEntityTypeEvent, None  # type: ignore
        )

        # Find the specified calendar
        calendars = event_store.calendarsForEntityType_(EventKit.EKEntityTypeEvent)  # type: ignore
        calendar = None
        for cal in calendars:
            if cal.title() == self.calendar_name:
                calendar = cal
                break

        if not calendar:
            raise Exception(f"Calendar '{self.calendar_name}' not found")

        # Create the event
        event = EventKit.EKEvent.eventWithEventStore_(event_store)  # type: ignore
        event.setTitle_(self.title)
        event.setLocation_(self.location)
        event.setNotes_(self.description)

        # Set start and end dates
        start_date = Foundation.NSDate.dateWithTimeIntervalSince1970_(  # type: ignore
            self.start_date.to_datetime().timestamp()
        )
        end_date = Foundation.NSDate.dateWithTimeIntervalSince1970_(  # type: ignore
            self.end_date.to_datetime().timestamp()
        )

        event.setStartDate_(start_date)
        event.setEndDate_(end_date)
        event.setCalendar_(calendar)

        # Save the event
        success, error = event_store.saveEvent_span_error_(
            event, EventKit.EKSpanThisEvent, None  # type: ignore
        )

        if not success:
            raise Exception(f"Failed to create calendar event: {error}")


class ListCalendarEvents(BaseNode):
    """
    List events from Apple Calendar within a specified date range
    calendar, automation, macos, productivity

    Use cases:
    - Retrieve upcoming events
    - Check schedule availability
    - Export calendar events
    """

    days_back: int = Field(
        default=0, description="Number of days to look back from today", ge=0
    )
    days_forward: int = Field(
        default=7, description="Number of days to look forward from today", ge=0
    )
    calendar_name: str = Field(
        default="Calendar", description="Name of the calendar to search"
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["days_back", "days_forward", "calendar_name"]

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> list[CalendarEvent]:
        if not IS_MACOS:
            raise NotImplementedError("Calendar functionality is only available on macOS")
        # Calculate start and end dates based on days_back and days_forward
        now = datetime.now()
        start_date_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start_date_dt = start_date_dt.fromtimestamp(
            start_date_dt.timestamp() - (self.days_back * 86400)
        )
        end_date_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        end_date_dt = end_date_dt.fromtimestamp(
            end_date_dt.timestamp() + (self.days_forward * 86400)
        )

        # Convert to Foundation.NSDate
        start_date = Foundation.NSDate.dateWithTimeIntervalSince1970_(  # type: ignore
            start_date_dt.timestamp()
        )
        end_date = Foundation.NSDate.dateWithTimeIntervalSince1970_(  # type: ignore
            end_date_dt.timestamp()
        )

        # Get the event store
        event_store = EventKit.EKEventStore.alloc().init()  # type: ignore

        # Request calendar access
        event_store.requestAccessToEntityType_completion_(
            EventKit.EKEntityTypeEvent, None  # type: ignore
        )

        # Find the specified calendar
        calendars = event_store.calendarsForEntityType_(EventKit.EKEntityTypeEvent)  # type: ignore
        calendar = None
        for cal in calendars:
            if cal.title() == self.calendar_name:
                calendar = cal
                break

        if not calendar:
            raise Exception(f"Calendar '{self.calendar_name}' not found")

        # Create date range predicate
        predicate = event_store.predicateForEventsWithStartDate_endDate_calendars_(
            start_date, end_date, [calendar]
        )

        # Fetch events
        events = event_store.eventsMatchingPredicate_(predicate)

        # Convert events to CalendarEvent format
        event_list = []
        for event in events:
            calendar_event = CalendarEvent(
                title=str(event.title()),
                start_date=Datetime.from_timestamp(
                    event.startDate().timeIntervalSince1970()
                ),
                end_date=Datetime.from_timestamp(
                    event.endDate().timeIntervalSince1970()
                ),
                location=str(event.location()) if event.location() else "",
                notes=str(event.notes()) if event.notes() else "",
                calendar=str(event.calendar().title()),
            )
            event_list.append(calendar_event)

        return event_list
