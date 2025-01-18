# nodetool.nodes.apple.notes

## CreateNote

Create a new note in Apple Notes via AppleScript

Use cases:
- Automatically save information to Notes
- Create documentation or records
- Save workflow outputs as notes

**Tags:** notes, automation, macos, productivity

**Fields:**
- **title**: Title of the note (str)
- **body**: Content of the note (str)
- **folder**: Notes folder to save to (str)


## ReadNotes

Read notes from Apple Notes via AppleScript using temporary files

Use cases:
- Access your Apple Notes content programmatically
- Search through notes using keywords
- Get notes content for further processing

**Tags:** notes, automation, macos, productivity

**Fields:**
- **search_term**: Optional search term to filter notes (str)
- **note_limit**: Maximum number of notes to export (0 for unlimited) (int)
- **note_limit_per_folder**: Maximum notes per folder (0 for unlimited) (int)


### escape_for_applescript

Escape special characters for AppleScript strings.
**Args:**
- **text (str)**

**Returns:** str

