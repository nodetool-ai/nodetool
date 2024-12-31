# nodetool.nodes.apple.reminders

## CreateReminder

Create a new reminder in Apple Reminders via AppleScript

Use cases:
- Automate task creation
- Create reminders from workflow outputs
- Schedule follow-up tasks

**Tags:** reminders, automation, macos, productivity

**Fields:**
- **title**: Title of the reminder (str)
- **list_name**: Name of the reminders list (str)
- **notes**: Additional notes for the reminder (str)
- **due_date**: Due date for the reminder (typing.Optional[datetime.datetime])
- **priority**: Priority (0-9, where 0 is no priority) (int)


## ReadReminders

Read reminders from Apple Reminders via AppleScript

Use cases:
- Monitor tasks and to-dos
- Process reminder data in workflows
- Extract task information

**Tags:** reminders, automation, macos, productivity

**Fields:**
- **list_name**: Name of the reminders list (str)
- **include_completed**: Whether to include completed reminders (bool)
- **search_term**: Optional search term to filter reminders (str)


