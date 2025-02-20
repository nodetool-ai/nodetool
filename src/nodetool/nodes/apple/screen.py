from cmath import rect
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.nodes.apple import IS_MACOS

if IS_MACOS:
    import Quartz  # type: ignore
    import PIL.Image


class CaptureScreen(BaseNode):
    """
    Capture screen content via PyObjC
    screen, automation, macos, media
    """

    whole_screen: bool = Field(default=True, description="Capture the whole screen")
    x: int = Field(default=0, description="X coordinate of the region to capture")
    y: int = Field(default=0, description="Y coordinate of the region to capture")
    width: int = Field(default=1920, description="Width of the region to capture")
    height: int = Field(default=1080, description="Height of the region to capture")

    async def process(self, context: ProcessingContext) -> ImageRef:
        if not IS_MACOS:
            raise NotImplementedError("Screen capture functionality is only available on macOS")
        main_display = Quartz.CGMainDisplayID()  # type: ignore

        # If region is specified, capture that region, otherwise capture full screen
        if self.whole_screen:
            image = Quartz.CGDisplayCreateImage(main_display)  # type: ignore
        else:
            # Capture the entire main display
            image = Quartz.CGWindowListCreateImage(  # type: ignore
                rect,
                Quartz.kCGWindowListOptionOnScreenOnly,  # type: ignore
                Quartz.kCGNullWindowID,  # type: ignore
                Quartz.kCGWindowImageDefault,  # type: ignore
            )  # type: ignore

        if image is None:
            raise RuntimeError("Failed to capture screen")

        data = Quartz.CFDataCreateMutable(None, 0)  # type: ignore
        dest = Quartz.CGImageDestinationCreateWithData(data, "public.png", 1, None)  # type: ignore

        if dest is None:
            raise RuntimeError("Failed to create image destination")

        Quartz.CGImageDestinationAddImage(dest, image, None)  # type: ignore
        Quartz.CGImageDestinationFinalize(dest)  # type: ignore

        return await context.image_from_bytes(bytes(data))
