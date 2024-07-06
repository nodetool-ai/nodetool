import PIL.ImageFilter
import PIL.ImageOps
import PIL.Image
import PIL.ImageEnhance
import numpy as np
from pydantic import Field
from nodetool.metadata.types import FolderRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import VideoRef
import tempfile


class SaveVideo(BaseNode):
    """
    Save a video to a file.
    video, save, file, output

    Use cases:
    1. Export processed video to a specific folder
    2. Save video with a custom name
    3. Create a copy of a video in a different location
    """

    value: VideoRef = Field(default=VideoRef(), description="The video to save.")
    folder: FolderRef = Field(
        default=FolderRef(), description="Name of the output folder."
    )
    name: str = Field(default="video", description="Name of the output video.")

    async def process(self, context: ProcessingContext) -> VideoRef:
        video = await context.asset_to_io(self.value)
        return await context.video_from_io(
            buffer=video,
            name=self.name,
            parent_id=self.folder.asset_id,
        )


class ExtractVideoFrames(BaseNode):
    """
    Extract frames from a video file.
    video, frames, extract, sequence

    Use cases:
    1. Generate image sequences for further processing
    2. Extract specific frame ranges from a video
    3. Create thumbnails or previews from video content
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to adjust the brightness for."
    )
    start: int = Field(default=0, description="The frame to start extracting from.")
    end: int = Field(default=-1, description="The frame to stop extracting from.")

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        import imageio.v3 as iio

        video_file = await context.asset_to_io(self.video)
        images = []
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp:
            temp.write(video_file.read())
            temp.flush()
            for i, frame in enumerate(iio.imiter(temp.name, plugin="pyav")):
                if i > self.start and (self.end == -1 or i < self.end):
                    img = PIL.Image.fromarray(frame)
                    img_ref = await context.image_from_pil(img)
                    images.append(img_ref)
        return images


class VideoFps(BaseNode):
    """
    Get the frames per second (FPS) of a video file.
    video, analysis, frames, fps

    Use cases:
    1. Analyze video properties for quality assessment
    2. Determine appropriate playback speed for video editing
    3. Ensure compatibility with target display systems
    """

    video: VideoRef = Field(
        default=VideoRef(), description="The input video to adjust the brightness for."
    )

    async def process(self, context: ProcessingContext) -> float:
        import imageio.v3 as iio

        video_file = await context.asset_to_io(self.video)
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp:
            temp.write(video_file.read())
            temp.flush()
            return iio.immeta(temp.name, plugin="pyav")["fps"]


class FramesToVideo(BaseNode):
    """
    Combine a sequence of frames into a single video file.
    video, frames, combine, sequence

    Use cases:
    1. Create time-lapse videos from image sequences
    2. Compile processed frames back into a video
    3. Generate animations from individual images
    """

    frames: list[ImageRef] = Field(
        default_factory=list, description="The frames to combine into a video."
    )
    fps: float = Field(default=30, description="The FPS of the output video.")

    async def process(self, context: ProcessingContext) -> VideoRef:
        import imageio.v3 as iio

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp:
            out = iio.imopen(temp.name, "w", plugin="pyav")
            out.init_video_stream("vp9", fps=self.fps)
            for img_ref in self.frames:
                img = await context.image_to_pil(img_ref)
                out.write_frame(np.array(img))
            out.close()
            return await context.video_from_io(open(temp.name, "rb"))
