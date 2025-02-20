from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CreateNote(GraphNode):
    """
    Create a new note in Apple Notes via AppleScript
    notes, automation, macos, productivity

    Use cases:
    - Automatically save information to Notes
    - Create documentation or records
    - Save workflow outputs as notes
    """

    title: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Title of the note')
    body: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Content of the note')
    folder: str | GraphNode | tuple[GraphNode, str] = Field(default='Notes', description='Notes folder to save to')

    @classmethod
    def get_node_type(cls): return "apple.notes.CreateNote"



class ReadNotes(GraphNode):
    """
    Read notes from Apple Notes via AppleScript using temporary files
    notes, automation, macos, productivity

    Use cases:
    - Access your Apple Notes content programmatically
    - Search through notes using keywords
    - Get notes content for further processing
    """

    note_limit: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Maximum number of notes to export (0 for unlimited)')
    note_limit_per_folder: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Maximum notes per folder (0 for unlimited)')

    @classmethod
    def get_node_type(cls): return "apple.notes.ReadNotes"


