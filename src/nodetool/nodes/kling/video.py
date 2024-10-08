import enum
from io import BytesIO
from pydantic import Field
from nodetool.nodes.kling.api import ImageToVideoRequest, VideoGenerationRequest
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import VideoRef, ImageRef
from nodetool.common.environment import Environment
import aiohttp


class KlingAspectRatio(str, enum.Enum):
    ONE_BY_ONE = "1:1"
    SIXTEEN_BY_NINE = "16:9"
    NINE_BY_SIXTEEN = "9:16"
    FOUR_BY_THREE = "4:3"
    THREE_BY_FOUR = "3:4"
    TWENTY_ONE_BY_NINE = "21:9"
    NINE_BY_TWENTY_ONE = "9:21"


class KlingVideoMode(str, enum.Enum):
    std = "std"
    pro = "pro"


class KlingVideoDuration(str, enum.Enum):
    _5s = "5"
    _10s = "10"


class KlingTextToVideo(BaseNode):
    """
    Generate a video from a text prompt using Kling AI.
    AI, video generation, text-to-video

    Use cases:
    1. Create animated content from textual descriptions
    2. Generate video assets for creative projects
    3. Visualize concepts or ideas in video form
    """

    prompt: str = Field(default="", description="The text prompt for video generation.")
    negative_prompt: str = Field(
        default="", description="The negative prompt for video generation."
    )
    cfg_scale: float = Field(
        default=0.5, ge=0, le=1, description="The cfg scale for video generation."
    )
    mode: KlingVideoMode = Field(
        default=KlingVideoMode.std, description="The mode for video generation."
    )
    # camera_control: dict = Field(
    #     default_factory=dict,
    #     description="Camera control settings for video generation.",
    # )
    aspect_ratio: KlingAspectRatio = Field(
        default=KlingAspectRatio.SIXTEEN_BY_NINE,
        description="Aspect ratio of the generated video.",
    )
    duration: KlingVideoDuration = Field(
        default=KlingVideoDuration._5s, description="Duration of the generated video."
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        client = Environment.get_kling_ai_client()

        request = VideoGenerationRequest(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            cfg_scale=self.cfg_scale,
            mode=self.mode.value,
            # camera_control=self.camera_control,
            aspect_ratio=self.aspect_ratio.value,
            duration=self.duration.value,
        )

        response = await client.create_text_to_video_task_and_wait(request)

        if response.data.task_status == "succeed":
            assert response.data.task_result is not None
            assert response.data.task_result.videos is not None
            video_url = response.data.task_result.videos[0].url
            async with aiohttp.ClientSession() as session:
                async with session.get(video_url) as resp:
                    content = await resp.content.read()
                    return await context.video_from_io(BytesIO(content))
        else:
            raise RuntimeError(f"Video generation failed: {response.message}")


class KlingImageToVideo(BaseNode):
    """
    Generate a video from an image using Kling AI.
    AI, video generation, image-to-video

    Use cases:
    1. Animate still images
    2. Create dynamic content from static visuals
    3. Extend single frame concepts into full motion videos
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The input image for video generation."
    )
    image_tail: str = Field(
        default="", description="The image tail for video generation."
    )
    prompt: str = Field(default="", description="The text prompt for video generation.")
    negative_prompt: str = Field(
        default="", description="The negative prompt for video generation."
    )
    cfg_scale: float = Field(
        default=0.5, ge=0, le=1, description="The cfg scale for video generation."
    )
    mode: KlingVideoMode = Field(
        default=KlingVideoMode.std, description="The mode for video generation."
    )
    duration: KlingVideoDuration = Field(
        default=KlingVideoDuration._5s, description="Duration of the generated video."
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        client = Environment.get_kling_ai_client()

        image_url = await context.upload_tmp_asset(self.image)

        request = ImageToVideoRequest(
            image=image_url,
            image_tail=self.image_tail,
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            cfg_scale=self.cfg_scale,
            mode=self.mode.value,
            duration=self.duration.value,
        )

        response = await client.create_image_to_video_task_and_wait(request)

        if response.data.task_status == "succeed":
            assert response.data.task_result is not None
            assert response.data.task_result.videos is not None
            video_url = response.data.task_result.videos[0].url
            async with aiohttp.ClientSession() as session:
                async with session.get(video_url) as resp:
                    content = await resp.content.read()
                    return await context.video_from_io(BytesIO(content))
        else:
            raise RuntimeError(f"Video generation failed: {response.message}")
