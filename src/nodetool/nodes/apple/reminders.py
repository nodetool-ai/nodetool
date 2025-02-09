from pydantic import Field
import EventKit  # type: ignore
import Foundation  # type: ignore
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import Datetime


class CreateReminder(BaseNode):
    """
    Create reminders using macOS Reminders.app via PyObjC
    reminders, automation, macos, productivity
    """

    title: str = Field(default="", description="Title of the reminder")
    due_date: Datetime = Field(default=None, description="Due date for the reminder")
    list_name: str = Field(
        default="Reminders", description="Name of the reminders list"
    )
    notes: str = Field(default="", description="Additional notes for the reminder")
    priority: int = Field(default=0, description="Priority (0-5)")
