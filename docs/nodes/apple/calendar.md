# nodetool.nodes.apple.calendar

## CreateCalendarEvent

Create a new event in Apple Calendar via AppleScript

Use cases:
- Automate event creation
- Schedule meetings programmatically
- Create recurring events

**Tags:** calendar, automation, macos, productivity

**Fields:**
- **title**: Title of the calendar event (str)
- **start_date**: Start date and time of the event (datetime)
- **end_date**: End date and time of the event (datetime)
- **calendar_name**: Name of the calendar (str)
- **location**: Location of the event (str)
- **description**: Description/notes for the event (str)


## ReadCalendarEvents

Read events from Apple Calendar via AppleScript

Use cases:
- Monitor upcoming events
- Process calendar data in workflows
- Extract event information

**Tags:** calendar, automation, macos, productivity

**Fields:**
- **calendar_name**: Name of the calendar (str)
- **days_ahead**: Number of days ahead to fetch events (int)
- **search_term**: Optional search term to filter events (str)


