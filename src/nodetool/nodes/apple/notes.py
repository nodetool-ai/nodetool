import subprocess
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import TextRef
import tempfile
import os
from pathlib import Path
from nodetool.nodes.apple import IS_MACOS

if IS_MACOS:
    from Foundation import NSObject  # type: ignore

export_notes_script = Path(__file__).parent / "exportnotes.applescript"

def escape_for_applescript(text: str) -> str:
    """Escape special characters for AppleScript strings."""
    # First escape backslashes, then quotes
    text = text.replace("\\", "\\\\")
    text = text.replace('"', '\\"')
    # No need to escape single quotes for AppleScript
    text = text.replace("\n", "\\n")
    return text


class CreateNote(BaseNode):
    """
    Create a new note in Apple Notes via AppleScript
    notes, automation, macos, productivity

    Use cases:
    - Automatically save information to Notes
    - Create documentation or records
    - Save workflow outputs as notes
    """
    title: str = Field(default="", description="Title of the note")
    body: str = Field(default="", description="Content of the note")
    folder: str = Field(default="Notes", description="Notes folder to save to")

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext):
        if not IS_MACOS:
            raise NotImplementedError("Notes functionality is only available on macOS")
        body_content = escape_for_applescript(self.body)
        title = escape_for_applescript(self.title)

        script = f"""
        tell application "Notes"
            tell account "iCloud"
                try
                    set targetFolder to folder "{self.folder}"
                on error
                    set targetFolder to default folder
                end try
                
                make new note at targetFolder with properties {{name:"{title}", body:"{body_content}"}}
            end tell
        end tell
        """

        try:
            result = subprocess.run(
                ["osascript", "-e", script], check=True, capture_output=True, text=True
            )
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to create note: {e.stderr}")

class ReadNotes(BaseNode):
    """Read notes from Apple Notes via AppleScript"""
    note_limit: int = Field(default=10, description="Maximum number of notes to export")
    note_limit_per_folder: int = Field(default=10, description="Maximum notes per folder")

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> list[dict]:
        if not IS_MACOS:
            raise NotImplementedError("Notes functionality is only available on macOS")
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                # Pass arguments positionally to the AppleScript
                result = subprocess.run(
                    [
                        "osascript",
                        str(export_notes_script),
                        temp_dir,
                        str(self.note_limit),
                        str(self.note_limit_per_folder),
                        "&title",
                        "&account-&folder",
                        "true",
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )

                # Read and parse the exported notes
                notes = []
                for root, _, files in os.walk(temp_dir):
                    for file in files:
                        if file.endswith(".html"):
                            file_path = Path(root) / file
                            # Try UTF-8 first, fall back to other encodings if needed
                            content = None
                            encodings = ["utf-8", "utf-16", "ascii", "iso-8859-1"]
                            for encoding in encodings:
                                try:
                                    with open(file_path, "r", encoding=encoding) as f:
                                        content = f.read()
                                    break  # Successfully read the file, exit the loop
                                except UnicodeError:
                                    continue  # UnicodeError is a superclass of UnicodeDecodeError

                            if content is None:
                                raise Exception(
                                    f"Failed to decode file {file_path} with any supported encoding"
                                )

                            # Extract folder from path
                            relative_path = Path(root).relative_to(temp_dir)
                            folder = (
                                relative_path.parts[0]
                                if relative_path.parts
                                else "Notes"
                            )

                            note = {
                                "title": file.replace(".html", ""),
                                "content": content,
                                "folder": folder,
                            }

                            notes.append(note)

                return notes

            except subprocess.CalledProcessError as e:
                raise Exception(f"Failed to read notes: {e.stderr}")
