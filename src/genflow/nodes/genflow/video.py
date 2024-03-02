import PIL.ImageFilter
import PIL.ImageOps
import PIL.Image
import PIL.ImageEnhance
import numpy as np
from pydantic import Field
from genflow.metadata.types import FolderRef
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import ImageRef
from genflow.workflows.genflow_node import GenflowNode
from genflow.metadata.types import VideoRef
import tempfile


class SaveVideoNode(GenflowNode):
    """
    ## Save Video Node
    ### Namespace: Video

    #### Description
    This node saves a video to the workspace.

    #### Applications
    - Saving a video for later use in the workflow.

    #### Inputs
    - `video`: The video to save.
    - `name`: The name of the video.
    """

    value: VideoRef = VideoRef()
    folder: FolderRef = Field(
        default=FolderRef(), description="Name of the output folder."
    )
    name: str = Field(default="video", description="Name of the output video.")

    async def process(self, context: ProcessingContext) -> VideoRef:
        video = await context.to_io(self.value)
        return await context.video_from_io(
            buffer=video,
            name=self.name,
            parent_id=self.folder.asset_id,
        )


class ExtractVideoFramesNode(GenflowNode):
    """
    ## Extract Video Frames Node
    ### Namespace: Video

    #### Description
    Extracts frames from a video.

    #### Applications
    - Extracting frames from a video for working on individual frames.

    ##### Inputs
    - `video`: Video to extract frames from.
    - `start`: The frame to start extracting from.
    - `end`: The frame to stop extracting from.

    ##### Outputs
    - `output`: The extracted frames.
    """

    video: VideoRef = Field(description="The input video to adjust the brightness for.")
    start: int = Field(default=0, description="The frame to start extracting from.")
    end: int = Field(default=-1, description="The frame to stop extracting from.")

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        import imageio.v3 as iio

        video_file = await context.to_io(self.video)
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


class VideoFpsNode(GenflowNode):
    """
    ## Video FPS Node
    ### Namespace: Video

    #### Description
    This node returns the FPS of a video.

    #### Applications
    - Getting the FPS of a video.

    ##### Inputs
    - `video`: The video to get the FPS of.

    ##### Outputs
    - `output`: The FPS of the video.
    """

    video: VideoRef = Field(description="The input video to adjust the brightness for.")

    async def process(self, context: ProcessingContext) -> float:
        import imageio.v3 as iio

        video_file = await context.to_io(self.video)
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp:
            temp.write(video_file.read())
            temp.flush()
            return iio.immeta(temp.name, plugin="pyav")["fps"]


class FramesToVideoNode(GenflowNode):
    """
    ## Frames to Video Node
    ### Namespace: Video

    #### Description
    This node combines a series of frames into a video.

    #### Inputs
    - `frames`: The frames to be combined into a video.
    """

    frames: list[ImageRef] = []
    fps: float = Field(default=30, description="The FPS of the output video.")

    async def process(self, context: ProcessingContext) -> VideoRef:
        import imageio.v3 as iio

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as temp:
            out = iio.imopen(temp.name, "w", plugin="pyav")
            out.init_video_stream("vp9", fps=self.fps)
            for img_ref in self.frames:
                img = await context.to_pil(img_ref)
                out.write_frame(np.array(img))
            out.close()
            return await context.video_from_io(open(temp.name, "rb"))
