import enum
from io import BytesIO
import tempfile
import uuid
import lumaai
from typing import Any, Optional
from pydantic import Field
from nodetool.types.prediction import Prediction
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import VideoRef, ImageRef, TextRef
from nodetool.common.environment import Environment
import asyncio
import aiohttp


class LumaAspectRatio(str, enum.Enum):
    ONE_BY_ONE = "1:1"
    SIXTEEN_BY_NINE = "16:9"
    NINE_BY_SIXTEEN = "9:16"
    FOUR_BY_THREE = "4:3"
    THREE_BY_FOUR = "3:4"
    TWENTY_ONE_BY_NINE = "21:9"
    NINE_BY_TWENTY_ONE = "9:21"


class TextToVideo(BaseNode):
    """
    Generate a video from a text prompt using Luma AI.
    AI, video generation, text-to-video

    Use cases:
    1. Create animated content from textual descriptions
    2. Generate video assets for creative projects
    3. Visualize concepts or ideas in video form
    """

    prompt: str = Field(default="", description="The text prompt for video generation.")
    loop: bool = Field(default=False, description="Whether the video should loop.")
    aspect_ratio: LumaAspectRatio = Field(
        default=LumaAspectRatio.SIXTEEN_BY_NINE,
        description="Aspect ratio of the generated video.",
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        client = Environment.get_lumaai_client()

        generation = await client.generations.create(
            prompt=self.prompt, loop=self.loop, aspect_ratio=self.aspect_ratio.value
        )
        assert generation.id

        video_url = await poll_for_completion(client, generation.id)

        async with aiohttp.ClientSession() as session:
            async with session.get(video_url) as response:
                content = await response.content.read()
                return await context.video_from_io(BytesIO(content))


async def poll_for_completion(
    client: lumaai.AsyncClient,
    generation_id: str,
    max_attempts: int = 600,
    delay: int = 1,
) -> str:
    for _ in range(max_attempts):
        generation = await client.generations.get(id=generation_id)
        print(generation)
        if generation.state == "dreaming":
            pass
        elif generation.state == "completed":
            assert generation.assets
            assert generation.assets.video
            return generation.assets.video
        elif generation.state == "failed":
            raise RuntimeError(f"Video generation failed: {generation.failure_reason}")
        await asyncio.sleep(delay)
    raise TimeoutError("Video generation timed out")


class ImageToVideo(BaseNode):
    """
    Generate a video from an image using Luma AI.
    AI, video generation, image-to-video

    Use cases:
    1. Animate still images
    2. Create dynamic content from static visuals
    3. Extend single frame concepts into full motion videos
    """

    prompt: str = Field(default="", description="The text prompt for video generation.")
    image: ImageRef = Field(
        default=ImageRef(), description="The input image for video generation."
    )
    loop: bool = Field(default=False, description="Whether the video should loop.")
    aspect_ratio: LumaAspectRatio = Field(
        default=LumaAspectRatio.SIXTEEN_BY_NINE,
        description="Aspect ratio of the generated video.",
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        client = Environment.get_lumaai_client()

        image_url = await context.upload_tmp_asset(self.image)

        generation = await client.generations.create(
            prompt=self.prompt,
            loop=self.loop,
            aspect_ratio=self.aspect_ratio.value,
            keyframes={"frame0": {"type": "image", "url": image_url}},
        )

        assert generation
        assert generation.id
        video_url = await poll_for_completion(client, generation.id)

        async with aiohttp.ClientSession() as session:
            async with session.get(video_url) as response:
                content = await response.content.read()
                return await context.video_from_io(BytesIO(content))


# class LumaAIExtendVideo(BaseNode):
#     """
#     Extend an existing video using Luma AI.
#     AI, video generation, video extension

#     Use cases:
#     1. Lengthen existing video content
#     2. Create continuations of generated videos
#     3. Develop longer narratives from short video clips
#     """

#     prompt: TextRef = Field(
#         default="", description="The text prompt for video extension."
#     )
#     video: VideoRef = Field(
#         default=VideoRef(), description="The input video to extend."
#     )
#     reverse: bool = Field(
#         default=False, description="Whether to reverse extend the video."
#     )

#     async def process(self, context: ProcessingContext) -> VideoRef:
#         client = Environment.get_lumaai_client()

#         # Assuming the input video is a previously generated Luma AI video
#         # You might need to adjust this based on your actual implementation
#         video_id = self.video.asset_id

#         keyframes = {
#             "frame0" if not self.reverse else "frame1": {
#                 "type": "generation",
#                 "id": video_id,
#             }
#         }

#         generation = await client.generations.create(
#             prompt=self.prompt, keyframes=keyframes
#         )

#         video_url = await self._poll_for_completion(client, generation.id)

#         async with aiohttp.ClientSession() as session:
#             async with session.get(video_url) as response:
#                 video_content = await response.read()

#         return await context.video_from_io(video_content)

#     async def _poll_for_completion(
#         self, client, generation_id: str, max_attempts: int = 60, delay: int = 5
#     ) -> str:
#         for _ in range(max_attempts):
#             generation = await client.generations.get(id=generation_id)
#             if generation.status == "completed":
#                 return generation.assets.video
#             await asyncio.sleep(delay)
#         raise TimeoutError("Video generation timed out")


# class LumaAIInterpolateVideos(BaseNode):
#     """
#     Interpolate between two videos using Luma AI.
#     AI, video generation, video interpolation

#     Use cases:
#     1. Create smooth transitions between different video clips
#     2. Generate intermediate scenes between two distinct videos
#     3. Blend multiple AI-generated videos into a cohesive sequence
#     """

#     prompt: TextRef = Field(
#         default="", description="The text prompt for video interpolation."
#     )
#     video_start: VideoRef = Field(
#         default=VideoRef(), description="The starting video for interpolation."
#     )
#     video_end: VideoRef = Field(
#         default=VideoRef(), description="The ending video for interpolation."
#     )

#     async def process(self, context: ProcessingContext) -> VideoRef:
#         client = Environment.get_lumaai_client()

#         # Assuming the input videos are previously generated Luma AI videos
#         # You might need to adjust this based on your actual implementation
#         video_start_id = self.video_start.asset_id
#         video_end_id = self.video_end.asset_id

#         generation = await client.generations.create(
#             prompt=self.prompt,
#             keyframes={
#                 "frame0": {"type": "generation", "id": video_start_id},
#                 "frame1": {"type": "generation", "id": video_end_id},
#             },
#         )

#         video_url = await self._poll_for_completion(client, generation.id)

#         async with aiohttp.ClientSession() as session:
#             async with session.get(video_url) as response:
#                 video_content = await response.read()

#         return await context.video_from_io(video_content)

#     async def _poll_for_completion(
#         self, client, generation_id: str, max_attempts: int = 60, delay: int = 5
#     ) -> str:
#         for _ in range(max_attempts):
#             generation = await client.generations.get(id=generation_id)
#             if generation.status == "completed":
#                 return generation.assets.video
#             await asyncio.sleep(delay)
#         raise TimeoutError("Video generation timed out")
