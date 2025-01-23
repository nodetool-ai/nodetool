from enum import Enum
import tempfile
from typing import List, Optional
import os
import shutil
from pydantic import Field
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
import io
import shlex
import subprocess


class GetEnvironmentVariable(BaseNode):
    """
    Gets an environment variable value.
    environment, variable, system

    Use cases:
    - Access configuration
    - Get system settings
    """

    name: str = Field(default="", description="Environment variable name")
    default: Optional[str] = Field(
        default=None, description="Default value if not found"
    )

    async def process(self, context: ProcessingContext) -> Optional[str]:
        return os.environ.get(self.name, self.default)


class SetEnvironmentVariable(BaseNode):
    """
    Sets an environment variable.
    environment, variable, system

    Use cases:
    - Configure runtime settings
    - Set up process environment
    """

    name: str = Field(default="", description="Environment variable name")
    value: str = Field(default="", description="Environment variable value")

    async def process(self, context: ProcessingContext) -> None:
        os.environ[self.name] = self.value
        return None


class GetSystemInfo(BaseNode):
    """
    Gets system information.
    system, info, platform

    Use cases:
    - Check system compatibility
    - Platform-specific logic
    """

    async def process(self, context: ProcessingContext) -> dict:
        return {
            "name": os.name,
            "current_dir": os.getcwd(),
            "cpu_count": os.cpu_count(),
            "path_separator": os.sep,
            "line_separator": os.linesep,
            "username": os.getlogin(),
        }


class CopyTextToClipboard(BaseNode):
    """
    Copies text to system clipboard.
    clipboard, system, copy

    Use cases:
    - Copy text to clipboard
    - Save output for external use
    """

    text: str = Field(default="", description="Text to copy to clipboard")

    async def process(self, context: ProcessingContext) -> None:
        escaped_text = shlex.quote(self.text)

        if os.name == "posix":
            if "darwin" in os.uname().sysname.lower():  # macOS
                result = subprocess.run(
                    ["sh", "-c", f"echo {escaped_text} | pbcopy"],
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    raise RuntimeError(f"Failed to copy to clipboard: {result.stderr}")
            else:  # Linux
                if shutil.which("xclip"):
                    result = subprocess.run(
                        [
                            "sh",
                            "-c",
                            f"echo {escaped_text} | xclip -selection clipboard",
                        ],
                        capture_output=True,
                        text=True,
                    )
                    if result.returncode != 0:
                        raise RuntimeError(
                            f"Failed to copy to clipboard: {result.stderr}"
                        )
                elif shutil.which("xsel"):
                    result = subprocess.run(
                        ["sh", "-c", f"echo {escaped_text} | xsel --clipboard --input"],
                        capture_output=True,
                        text=True,
                    )
                    if result.returncode != 0:
                        raise RuntimeError(
                            f"Failed to copy to clipboard: {result.stderr}"
                        )
                else:
                    raise RuntimeError(
                        "No clipboard tool found. Please install xclip or xsel."
                    )

        elif os.name == "nt":  # Windows
            subprocess.run(["clip"], input=self.text.encode(), check=True)
        else:
            raise RuntimeError("Unsupported operating system")


class PasteTextFromClipboard(BaseNode):
    """
    Pastes text from system clipboard.
    clipboard, system, paste

    Use cases:
    - Read clipboard content
    - Import external data
    """

    async def process(self, context: ProcessingContext) -> str:
        if os.name == "posix":
            if "darwin" in os.uname().sysname.lower():  # macOS
                return subprocess.check_output(["pbpaste"]).decode().strip()
            else:  # Linux
                if shutil.which("xclip"):
                    return (
                        subprocess.check_output(
                            ["xclip", "-selection", "clipboard", "-o"]
                        )
                        .decode()
                        .strip()
                    )
                elif shutil.which("xsel"):
                    return (
                        subprocess.check_output(["xsel", "--clipboard", "--output"])
                        .decode()
                        .strip()
                    )
                else:
                    raise RuntimeError(
                        "No clipboard tool found. Please install xclip or xsel."
                    )
        elif os.name == "nt":  # Windows
            result = subprocess.run(
                ["powershell.exe", "-command", "Get-Clipboard"],
                capture_output=True,
                text=True,
            )
            return result.stdout.strip()
        else:
            raise RuntimeError("Unsupported operating system")


class CopyImageToClipboard(BaseNode):
    """
    Copies an image to system clipboard.
    clipboard, system, copy, image

    Use cases:
    - Copy images to clipboard
    - Share screenshots or processed images
    """

    image: ImageRef = Field(default=None, description="Image to copy to clipboard")

    async def process(self, context: ProcessingContext):
        image = await context.image_to_pil(self.image)

        if os.name == "posix":
            if "darwin" in os.uname().sysname.lower():  # macOS
                # Convert image to PNG bytes
                buffer = io.BytesIO()
                image.save(buffer, format="PNG")
                png_data = buffer.getvalue()

                with tempfile.NamedTemporaryFile(
                    suffix=".png", delete=False
                ) as tmp_file:
                    tmp_file.write(png_data)
                    tmp_path = tmp_file.name

                # Escape the file path
                escaped_path = shlex.quote(tmp_path)
                result = subprocess.run(
                    [
                        "osascript",
                        "-e",
                        f'tell app "Finder" to set the clipboard to (POSIX file {escaped_path} as alias)',
                    ],
                    capture_output=True,
                    text=True,
                )
                os.unlink(tmp_path)  # Clean up temp file
                if result.returncode != 0:
                    raise RuntimeError(
                        f"Failed to copy image to clipboard: {result.stderr}"
                    )

            else:  # Linux
                if shutil.which("xclip"):
                    # Save image to temporary PNG file
                    with tempfile.NamedTemporaryFile(
                        suffix=".png", delete=False
                    ) as tmp_file:
                        image.save(tmp_file.name, format="PNG")
                        # Escape the file path
                        escaped_path = shlex.quote(tmp_file.name)
                        result = subprocess.run(
                            [
                                "xclip",
                                "-selection",
                                "clipboard",
                                "-t",
                                "image/png",
                                "-i",
                                escaped_path,
                            ],
                            capture_output=True,
                            text=True,
                        )
                        os.unlink(tmp_file.name)
                        if result.returncode != 0:
                            raise RuntimeError(
                                f"Failed to copy image to clipboard: {result.stderr}"
                            )
                else:
                    raise RuntimeError(
                        "xclip is required for copying images to clipboard on Linux"
                    )

        elif os.name == "nt":  # Windows
            import win32clipboard
            from io import BytesIO

            # Convert image to BMP format (Windows clipboard format)
            output = BytesIO()
            image.convert("RGB").save(output, "BMP")
            data = output.getvalue()[14:]  # Remove BMP header
            output.close()

            win32clipboard.OpenClipboard()
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardData(win32clipboard.CF_DIB, data)
            win32clipboard.CloseClipboard()

        else:
            raise RuntimeError("Unsupported operating system")
