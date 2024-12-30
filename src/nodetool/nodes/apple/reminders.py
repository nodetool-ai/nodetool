import subprocess
from datetime import datetime
from typing import Optional
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.apple.notes import escape_for_applescript


class CreateReminder(BaseNode):
    """
    Create a new reminder in Apple Reminders via AppleScript
    reminders, automation, macos, productivity

    Use cases:
    - Automate task creation
    - Create reminders from workflow outputs
    - Schedule follow-up tasks
    """

    title: str = Field(description="Title of the reminder")
    list_name: str = Field(
        default="Reminders", description="Name of the reminders list"
    )
    notes: str = Field(default="", description="Additional notes for the reminder")
    due_date: Optional[datetime] = Field(
        default=None, description="Due date for the reminder"
    )
    priority: int = Field(
        default=0, description="Priority (0-9, where 0 is no priority)"
    )

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> bool:
        title = escape_for_applescript(self.title)
        notes = escape_for_applescript(self.notes)

        script = f"""
        tell application "Reminders"
            tell list "{self.list_name}"
                make new reminder with properties {{
                    name: "{title}",
                    body: "{notes}",
                    priority: {self.priority}
        """

        if self.due_date:
            due_date = self.due_date.strftime("%Y-%m-%d %H:%M:%S")
            script += f', due date: date "{due_date}"'

        script += """
                }}
            end tell
        end tell
        """

        try:
            subprocess.run(["osascript", "-e", script], check=True)
            return True
        except subprocess.CalledProcessError:
            return False


class ReadReminders(BaseNode):
    """
    Read reminders from Apple Reminders via AppleScript
    reminders, automation, macos, productivity

    Use cases:
    - Monitor tasks and to-dos
    - Process reminder data in workflows
    - Extract task information
    """

    list_name: str = Field(
        default="Reminders", description="Name of the reminders list"
    )
    include_completed: bool = Field(
        default=False, description="Whether to include completed reminders"
    )
    search_term: str = Field(
        default="", description="Optional search term to filter reminders"
    )

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> list[dict]:
        search_term = escape_for_applescript(self.search_term)

        script = f"""
        tell application "Reminders"
            tell list "{self.list_name}"
                set reminderList to {{}}
                
                if "{search_term}" is "" then
                    set reminderList to reminders
                else
                    set reminderList to (every reminder whose name contains "{search_term}" or body contains "{search_term}")
                end if
                
                set reminderData to {{}}
                repeat with currentReminder in reminderList
                    if {str(self.include_completed).lower()} or (completed of currentReminder is false) then
                        set reminderProps to {{
                            name of currentReminder,
                            body of currentReminder,
                            id of currentReminder,
                            completed of currentReminder,
                            priority of currentReminder
                        }}
                        
                        if due date of currentReminder is not missing value then
                            set end of reminderProps to due date of currentReminder
                        else
                            set end of reminderProps to "none"
                        end if
                        
                        set end of reminderData to reminderProps
                    end if
                end repeat
                
                return reminderData
            end tell
        end tell
        """

        try:
            result = subprocess.run(
                ["osascript", "-e", script], check=True, capture_output=True, text=True
            )

            reminders = []
            if result.stdout.strip():
                raw_items = result.stdout.strip().split("}, {")
                for item in raw_items:
                    item = item.replace("{", "").replace("}", "").strip()
                    if item:
                        title, body, reminder_id, completed, priority, due_date = [
                            part.strip().strip('"') for part in item.split(",", 5)
                        ]
                        reminders.append(
                            {
                                "title": title,
                                "body": body,
                                "id": reminder_id,
                                "completed": completed.lower() == "true",
                                "priority": int(priority),
                                "due_date": None if due_date == "none" else due_date,
                            }
                        )

            return reminders
        except subprocess.CalledProcessError:
            return []
