# nodetool.nodes.nodetool.ui.tk

## DisplayImage

Display an image in a window.

Use cases:
- Preview image processing results
- Show generated images
- Display image transformations

**Tags:** gui, image, display

**Fields:**
- **title**: Window title (str)
- **width**: Window width (int)
- **height**: Window height (int)
- **image**: Image to display (ImageRef)


## DisplayText

Display text in a scrollable window.

Use cases:
- Show processing results
- Display log messages
- Preview text content

**Tags:** gui, text, display

**Fields:**
- **title**: Window title (str)
- **width**: Window width (int)
- **height**: Window height (int)
- **text**: Text content to display (str)
- **font**: Text font and size (str)


## DisplayWindow

Base class for Tkinter display windows

**Fields:**
- **title**: Window title (str)
- **width**: Window width (int)
- **height**: Window height (int)

### create_window

**Args:**

**Returns:** Tk


