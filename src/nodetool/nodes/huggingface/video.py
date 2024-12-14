from typing import Any
import numpy as np
from pydantic import Field
from nodetool.providers.huggingface.huggingface_node import progress_callback
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import (
    HFStableDiffusion,
    HuggingFaceModel,
    HFTextToVideo,
    ImageRef,
    VideoRef,
)
import torch
from diffusers.pipelines.animatediff.pipeline_animatediff import AnimateDiffPipeline
from diffusers.schedulers.scheduling_ddim import DDIMScheduler
from diffusers.models.unets.unet_motion_model import MotionAdapter
from diffusers.pipelines.stable_video_diffusion.pipeline_stable_video_diffusion import (
    StableVideoDiffusionPipeline,
)
from diffusers.utils.export_utils import export_to_video
from .huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.types import NodeProgress


class AnimateDiffNode(HuggingFacePipelineNode):
    """
    Generates animated GIFs using the AnimateDiff pipeline.
    image, animation, generation, AI

    Use cases:
    - Create animated visual content from text descriptions
    - Generate dynamic visual effects for creative projects
    - Produce animated illustrations for digital media
    """

    model: HFStableDiffusion = Field(
        default=HFStableDiffusion(),
        description="The model to use for image generation.",
    )

    prompt: str = Field(
        default="masterpiece, bestquality, highlydetailed, ultradetailed, sunset, "
        "orange sky, warm lighting, fishing boats, ocean waves seagulls, "
        "rippling water, wharf, silhouette, serene atmosphere, dusk, evening glow, "
        "golden hour, coastal landscape, seaside scenery",
        description="A text prompt describing the desired animation.",
    )
    negative_prompt: str = Field(
        default="bad quality, worse quality",
        description="A text prompt describing what you don't want in the animation.",
    )
    num_frames: int = Field(
        default=16, description="The number of frames in the animation.", ge=1, le=60
    )
    guidance_scale: float = Field(
        default=7.5, description="Scale for classifier-free guidance.", ge=1.0, le=20.0
    )
    num_inference_steps: int = Field(
        default=25, description="The number of denoising steps.", ge=1, le=100
    )
    seed: int = Field(
        default=42, description="Seed for the random number generator.", ge=0
    )

    _pipeline: AnimateDiffPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFTextToVideo(
                repo_id="guoyww/animatediff-motion-adapter-v1-5-2",
                allow_patterns=["*.fp16.safetensors", "*.json", "*.txt"],
            ),
            HFStableDiffusion(
                repo_id="Lykon/dreamshaper-8",
                allow_patterns=[
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                    "*.json",
                ],
            ),
            HFStableDiffusion(
                repo_id="Yntec/Deliberate2",
                allow_patterns=[
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                    "*.json",
                ],
            ),
            HFStableDiffusion(
                repo_id="imagepipeline/epiC-PhotoGasm",
                allow_patterns=[
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                    "*.json",
                ],
            ),
            HFStableDiffusion(
                repo_id="526christian/526mix-v1.5",
                allow_patterns=[
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                    "*.json",
                ],
            ),
            HFStableDiffusion(
                repo_id="stablediffusionapi/realistic-vision-v51",
                allow_patterns=[
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                    "*.json",
                ],
            ),
            HFStableDiffusion(
                repo_id="stablediffusionapi/anything-v5",
                allow_patterns=[
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                    "*.json",
                ],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        adapter = await self.load_model(
            context=context,
            model_class=MotionAdapter,
            model_id="guoyww/animatediff-motion-adapter-v1-5-2",
        )
        self._pipeline = await self.load_model(
            context=context,
            model_class=AnimateDiffPipeline,
            model_id=self.model.repo_id,
            motion_adapter=adapter,
        )

        scheduler = DDIMScheduler.from_pretrained(
            self.model.repo_id,
            subfolder="scheduler",
            clip_sample=False,
            timestep_spacing="linspace",
            beta_schedule="linear",
            steps_offset=1,
        )
        assert self._pipeline is not None
        self._pipeline.scheduler = scheduler
        self._pipeline.enable_vae_slicing()
        self._pipeline.enable_model_cpu_offload()

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> VideoRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        output = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            num_frames=self.num_frames,
            guidance_scale=self.guidance_scale,
            num_inference_steps=self.num_inference_steps,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
            generator=generator,
        )

        frames = output.frames[0]  # type: ignore

        return await context.video_from_numpy(frames)  # type: ignore


class StableVideoDiffusion(HuggingFacePipelineNode):
    """
    Generates a video from a single image using the Stable Video Diffusion model.
    video, generation, AI, image-to-video, stable-diffusion

    Use cases:
    - Create short animations from static images
    - Generate dynamic content for presentations or social media
    - Prototype video ideas from still concept art
    """

    input_image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to generate the video from, resized to 1024x576.",
    )
    num_frames: int = Field(
        default=14, ge=1, le=50, description="Number of frames to generate."
    )
    num_inference_steps: int = Field(
        default=25,
        ge=1,
        le=100,
        description="Number of steps per generated frame",
    )
    fps: int = Field(
        default=7, ge=1, le=30, description="Frames per second for the output video."
    )
    decode_chunk_size: int = Field(
        default=8, ge=1, le=16, description="Number of frames to decode at once."
    )
    seed: int = Field(
        default=42, ge=0, le=2**32 - 1, description="Random seed for generation."
    )

    _pipeline: StableVideoDiffusionPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFStableDiffusion(
                repo_id="stabilityai/stable-video-diffusion-img2vid-xt",
                allow_patterns=[
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                    "*.json",
                ],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableVideoDiffusionPipeline,
            model_id="stabilityai/stable-video-diffusion-img2vid-xt",
        )
        self._pipeline.enable_model_cpu_offload()  # type: ignore

    async def process(self, context: ProcessingContext) -> VideoRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Load and preprocess the input image
        input_image = await context.image_to_pil(self.input_image)
        input_image = input_image.resize((1024, 576))

        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        def callback(pipe: StableVideoDiffusionPipeline, step: int, *args):
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )
            return {}

        # Generate the video frames
        frames = self._pipeline(
            input_image,
            num_frames=self.num_frames,
            decode_chunk_size=self.decode_chunk_size,
            generator=generator,
            callback_on_step_end=callback,  # type: ignore
        ).frames[  # type: ignore
            0
        ]
        return await context.video_from_numpy(np.array(frames), fps=self.fps)  # type: ignore

    @classmethod
    def get_title(cls) -> str:
        return "Stable Video Diffusion"

    def required_inputs(self):
        return ["input_image"]
