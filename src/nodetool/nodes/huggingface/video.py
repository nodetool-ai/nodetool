from typing import Any
from pydantic import Field
from nodetool.providers.huggingface.huggingface_node import progress_callback
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef, VideoRef
import torch
from diffusers import AnimateDiffPipeline, DDIMScheduler, MotionAdapter  # type: ignore


class AnimateDiffNode(BaseNode):
    """
    Generates animated GIFs using the AnimateDiff pipeline.
    image, animation, generation, AI

    Use cases:
    - Create animated visual content from text descriptions
    - Generate dynamic visual effects for creative projects
    - Produce animated illustrations for digital media
    """

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

    async def initialize(self, context: ProcessingContext):
        adapter = MotionAdapter.from_pretrained(
            "guoyww/animatediff-motion-adapter-v1-5-2", torch_dtype=torch.float16
        )
        model_id = "SG161222/Realistic_Vision_V5.1_noVAE"
        self._pipeline = AnimateDiffPipeline.from_pretrained(
            model_id, motion_adapter=adapter, torch_dtype=torch.float16
        )  # type: ignore
        scheduler = DDIMScheduler.from_pretrained(
            model_id,
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

        generator = torch.Generator("cpu").manual_seed(self.seed)

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
