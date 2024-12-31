# nodetool.nodes.nodetool.os

## CopyImageToClipboard

Copies an image to system clipboard.

Use cases:
- Copy images to clipboard
- Share screenshots or processed images

**Tags:** clipboard, system, copy, image

**Fields:**
- **image**: Image to copy to clipboard (ImageRef)


## CopyTextToClipboard

Copies text to system clipboard.

Use cases:
- Copy text to clipboard
- Save output for external use

**Tags:** clipboard, system, copy

**Fields:**
- **text**: Text to copy to clipboard (str)


## GetEnvironmentVariable

Gets an environment variable value.

Use cases:
- Access configuration
- Get system settings

**Tags:** environment, variable, system

**Fields:**
- **name**: Environment variable name (str)
- **default**: Default value if not found (typing.Optional[str])


## GetSystemInfo

Gets system information.

Use cases:
- Check system compatibility
- Platform-specific logic

**Tags:** system, info, platform

**Fields:**


## PasteTextFromClipboard

Pastes text from system clipboard.

Use cases:
- Read clipboard content
- Import external data

**Tags:** clipboard, system, paste

**Fields:**


## SetEnvironmentVariable

Sets an environment variable.

Use cases:
- Configure runtime settings
- Set up process environment

**Tags:** environment, variable, system

**Fields:**
- **name**: Environment variable name (str)
- **value**: Environment variable value (str)


