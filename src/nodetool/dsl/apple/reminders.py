from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CreateReminder(GraphNode):
    """
    Create reminders using macOS Reminders.app via PyObjC
    reminders, automation, macos, productivity
    """

    title: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Title of the reminder')
    due_date: Datetime | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Due date for the reminder')
    list_name: str | GraphNode | tuple[GraphNode, str] = Field(default='Reminders', description='Name of the reminders list')
    notes: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Additional notes for the reminder')
    priority: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Priority (0-5)')

    @classmethod
    def get_node_type(cls): return "apple.reminders.CreateReminder"


