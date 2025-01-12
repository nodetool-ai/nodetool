from typing import Literal
from pydantic import Field

from nodetool.metadata.types import ImageRef, VideoRef
from nodetool.nodes.fal.fal_node import FALNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum

class VideoDuration(Enum):
    FOUR_SECONDS = 4
    SIX_SECONDS = 6

class HaiperImageToVideo(FALNode):
    """
    Transform images into hyper-realistic videos with Haiper 2.0. Experience industry-leading 
    resolution, fluid motion, and rapid generation for stunning AI videos.
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The image to transform into a video"
    )
    prompt: str = Field(
        default="",
        description="A description of the desired video motion and style"
    )
    duration: VideoDuration = Field(
        default=VideoDuration.FOUR_SECONDS,
        description="The duration of the generated video in seconds"
    )
    prompt_enhancer: bool = Field(
        default=True,
        description="Whether to use the model's prompt enhancer"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same video every time"
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "prompt": self.prompt,
            "duration": self.duration,
            "prompt_enhancer": self.prompt_enhancer
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/haiper-video-v2/image-to-video",
            arguments=arguments,
        )
        assert "video" in res
        return VideoRef(uri=res["video"]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "prompt", "duration"]

class AspectRatio(Enum):
    RATIO_16_9 = "16:9"
    RATIO_9_16 = "9:16"
    RATIO_4_3 = "4:3"
    RATIO_3_4 = "3:4"
    RATIO_21_9 = "21:9"
    RATIO_9_21 = "9:21"
    RATIO_1_1 = "1:1"

class KlingDuration(Enum):
    FIVE_SECONDS = "5"
    TEN_SECONDS = "10"

class LumaDreamMachine(FALNode):
    """
    Generate video clips from your images using Luma Dream Machine v1.5. Supports various aspect ratios
    and optional end-frame blending.
    """
    
    image: ImageRef = Field(
        default=ImageRef(),
        description="The image to transform into a video"
    )
    prompt: str = Field(
        default="",
        description="A description of the desired video motion and style"
    )
    aspect_ratio: AspectRatio = Field(
        default=AspectRatio.RATIO_16_9,
        description="The aspect ratio of the generated video"
    )
    loop: bool = Field(
        default=False,
        description="Whether the video should loop (end blends with beginning)"
    )
    end_image: ImageRef | None = Field(
        default=None,
        description="Optional image to blend the end of the video with"
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "prompt": self.prompt,
            "aspect_ratio": self.aspect_ratio.value,
            "loop": self.loop
        }
        
        if self.end_image:
            end_image_base64 = await context.image_to_base64(self.end_image)
            arguments["end_image_url"] = f"data:image/png;base64,{end_image_base64}"

        res = await self.submit_request(
            context=context,
            application="fal-ai/luma-dream-machine/image-to-video",
            arguments=arguments,
        )
        assert "video" in res
        return VideoRef(uri=res["video"]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "prompt", "aspect_ratio"]

class KlingVideo(FALNode):
    """
    Generate video clips from your images using Kling 1.6. Supports multiple durations and aspect ratios.
    """
    
    image: ImageRef = Field(
        default=ImageRef(),
        description="The image to transform into a video"
    )
    prompt: str = Field(
        default="",
        description="A description of the desired video motion and style"
    )
    duration: KlingDuration = Field(
        default=KlingDuration.FIVE_SECONDS,
        description="The duration of the generated video"
    )
    aspect_ratio: AspectRatio = Field(
        default=AspectRatio.RATIO_16_9,
        description="The aspect ratio of the generated video frame"
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "prompt": self.prompt,
            "duration": self.duration.value,
            "aspect_ratio": self.aspect_ratio.value
        }

        res = await self.submit_request(
            context=context,
            application="fal-ai/kling-video/v1.6/standard/image-to-video",
            arguments=arguments,
        )
        assert "video" in res
        return VideoRef(uri=res["video"]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "prompt", "duration"]

class KlingVideoPro(FALNode):
    """
    Generate video clips from your images using Kling 1.6 Pro. The professional version offers
    enhanced quality and performance compared to the standard version.
    """
    
    image: ImageRef = Field(
        default=ImageRef(),
        description="The image to transform into a video"
    )
    prompt: str = Field(
        default="",
        description="A description of the desired video motion and style"
    )
    duration: KlingDuration = Field(
        default=KlingDuration.FIVE_SECONDS,
        description="The duration of the generated video"
    )
    aspect_ratio: AspectRatio = Field(
        default=AspectRatio.RATIO_16_9,
        description="The aspect ratio of the generated video frame"
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "prompt": self.prompt,
            "duration": self.duration.value,
            "aspect_ratio": self.aspect_ratio.value
        }

        res = await self.submit_request(
            context=context,
            application="fal-ai/kling-video/v1.6/pro/image-to-video",
            arguments=arguments,
        )
        assert "video" in res
        return VideoRef(uri=res["video"]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "prompt", "duration"]
