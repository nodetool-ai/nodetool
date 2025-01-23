# src/nodetool/nodes/nodetool/tk.py

import tkinter as tk
from tkinter import ttk
import PIL.Image, PIL.ImageTk
from typing import Optional, Any
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef, AudioRef, VideoRef
from queue import Queue
import threading

from nodetool.workflows.types import RunFunction


class DisplayWindow(BaseNode):
    """
    Base class for Tkinter display windows
    """

    title: str = Field(default="Display Window", description="Window title")
    width: int = Field(default=400, description="Window width")
    height: int = Field(default=300, description="Window height")

    def create_window(self) -> tk.Tk:
        if threading.current_thread() is not threading.main_thread():
            raise RuntimeError("Tkinter windows must be created in the main thread")

        window = tk.Tk()
        window.title(self.title)
        window.geometry(f"{self.width}x{self.height}")

        # Center the window on the screen
        window.update_idletasks()  # Update window size
        screen_width = window.winfo_screenwidth()
        screen_height = window.winfo_screenheight()
        x = (screen_width - self.width) // 2
        y = (screen_height - self.height) // 2
        window.geometry(f"+{x}+{y}")

        return window

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not DisplayWindow


class DisplayText(DisplayWindow):
    """
    Display text in a scrollable window.
    gui, text, display

    Use cases:
    - Show processing results
    - Display log messages
    - Preview text content
    """

    text: str = Field(default="", description="Text content to display")
    font: str = Field(default="Arial 12", description="Text font and size")

    async def process(self, context: ProcessingContext) -> None:
        def setup_window():
            window = self.create_window()

            # Create scrolled text widget
            text_widget = tk.Text(window, wrap=tk.WORD, font=self.font)
            scrollbar = ttk.Scrollbar(
                window, orient="vertical", command=text_widget.yview
            )
            text_widget.configure(yscrollcommand=scrollbar.set)

            # Pack widgets
            scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
            text_widget.pack(expand=True, fill=tk.BOTH)

            # Insert text
            text_widget.insert("1.0", self.text)
            text_widget.config(state=tk.DISABLED)

            # Force focus on window
            window.focus_force()

            window.mainloop()

        context.post_message(RunFunction(function=setup_window))


class DisplayImage(DisplayWindow):
    """
    Display an image in a window.
    gui, image, display

    Use cases:
    - Preview image processing results
    - Show generated images
    - Display image transformations
    """

    image: ImageRef = Field(default=None, description="Image to display")

    async def process(self, context: ProcessingContext) -> None:
        pil_image = await context.image_to_pil(self.image)

        def setup_window():
            window = self.create_window()

            # Create Tkinter-compatible photo image
            photo = PIL.ImageTk.PhotoImage(pil_image)

            # Create and pack label with image
            label = tk.Label(window, image=photo)  # type: ignore
            label.image = photo  # type: ignore
            label.pack(expand=True)

            window.mainloop()

        context.post_message(RunFunction(function=setup_window))
