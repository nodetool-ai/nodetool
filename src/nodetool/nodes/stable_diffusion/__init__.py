from enum import Enum
from typing import Optional
import PIL.Image
import torch
from comfy_extras.nodes_custom_sampler import (
    BasicGuider,
    BasicScheduler,
    KSamplerSelect,
    RandomNoise,
    SamplerCustomAdvanced,
)
from comfy_extras.nodes_flux import FluxGuidance
from comfy_extras.nodes_model_advanced import ModelSamplingFlux
from nodes import (
    CLIPTextEncode,
    ControlNetApply,
    ControlNetLoader,
    DualCLIPLoader,
    EmptyLatentImage,
    KSampler,
    LoraLoader,
    LoraLoaderModelOnly,
    UNETLoader,
    VAEDecode,
    VAEEncode,
    LatentUpscale,
    VAEEncodeForInpaint,
    VAELoader,
)
import PIL.Image
import torch

from comfy.model_patcher import ModelPatcher
from comfy.sd import CLIP, VAE
from nodetool.metadata.types import CheckpointFile, ImageRef, LORAFile
from nodetool.nodes.stable_diffusion.enums import Sampler, Scheduler
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
import numpy as np

from nodetool.workflows.processing_context import ProcessingContext


class StableDiffusion(BaseNode):
    """
    Generates images based on an input image and text prompts using Stable Diffusion.
    Works with 1.5 and XL models. Supports optional high-resolution upscaling.
    image, image-to-image, generative AI, stable diffusion, high-resolution

    Use cases:
    - Modifying existing images based on text descriptions
    - Applying artistic styles to photographs
    - Generating variations of existing artwork or designs
    - Enhancing or altering stock images for specific needs
    - Creating high-resolution images from lower resolution inputs
    """

    model: CheckpointFile = Field(
        default=CheckpointFile(), description="Stable Diffusion checkpoint to load."
    )
    prompt: str = Field(default="", description="The prompt to use.")
    negative_prompt: str = Field(default="", description="The negative prompt to use.")
    seed: int = Field(default=0, ge=0, le=1000000)
    guidance_scale: float = Field(default=7.0, ge=1.0, le=30.0)
    num_inference_steps: int = Field(default=30, ge=1, le=100)
    width: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    scheduler: Scheduler = Field(default=Scheduler.exponential)
    sampler: Sampler = Field(default=Sampler.euler_ancestral)
    input_image: ImageRef = Field(
        default=ImageRef(), description="Input image for img2img (optional)"
    )
    mask_image: ImageRef = Field(
        default=ImageRef(), description="Mask image for img2img (optional)"
    )
    grow_mask_by: int = Field(default=6, ge=0, le=100)
    denoise: float = Field(default=1.0, ge=0.0, le=1.0)

    _model: ModelPatcher | None = None
    _clip: CLIP | None = None
    _vae: VAE | None = None
    _hires_model: ModelPatcher | None = None

    async def initialize(self, context: ProcessingContext):
        from nodes import CheckpointLoaderSimple

        checkpoint_loader = CheckpointLoaderSimple()
        self._model, self._clip, self._vae = checkpoint_loader.load_checkpoint(
            self.model.name
        )

    async def get_latent(self, context: ProcessingContext, width: int, height: int):
        if self.input_image.is_empty():
            return EmptyLatentImage().generate(width, height, 1)[0]
        else:
            input_pil = await context.image_to_pil(self.input_image)
            input_pil = input_pil.resize((width, height), PIL.Image.Resampling.LANCZOS)
            image = input_pil.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            input_tensor = torch.from_numpy(image)[None,]

            if not self.mask_image.is_empty():
                mask_pil = await context.image_to_pil(self.mask_image)
                mask_pil = mask_pil.resize(
                    (width, height), PIL.Image.Resampling.LANCZOS
                )
                mask = mask_pil.convert("L")
                mask = np.array(mask).astype(np.float32) / 255.0
                mask_tensor = torch.from_numpy(mask)[None,]
                return VAEEncodeForInpaint().encode(
                    self._vae, input_tensor, mask_tensor, self.grow_mask_by
                )[0]
            else:
                return VAEEncode().encode(self._vae, input_tensor)[0]

    def get_conditioning(self):
        positive_conditioning = CLIPTextEncode().encode(self._clip, self.prompt)[0]
        negative_conditioning = CLIPTextEncode().encode(
            self._clip, self.negative_prompt
        )[0]
        return positive_conditioning, negative_conditioning

    def sample(self, model, latent, positive, negative, num_steps):
        return KSampler().sample(
            model=model,
            seed=self.seed,
            steps=num_steps,
            cfg=self.guidance_scale,
            sampler_name=self.sampler.value,
            scheduler=self.scheduler.value,
            positive=positive,
            negative=negative,
            latent_image=latent,
            denoise=self.denoise,
        )[0]

    async def process(self, context: ProcessingContext) -> ImageRef:
        positive_conditioning, negative_conditioning = self.get_conditioning()

        if self.width >= 1024 and self.height >= 1024:
            num_hires_steps = self.num_inference_steps // 2
            num_lowres_steps = self.num_inference_steps - num_hires_steps
            initial_width, initial_height = self.width // 2, self.height // 2
        else:
            num_hires_steps = 0
            num_lowres_steps = self.num_inference_steps
            initial_width, initial_height = self.width, self.height

        latent = await self.get_latent(context, initial_width, initial_height)

        sampled_latent = self.sample(
            self._model,
            latent,
            positive_conditioning,
            negative_conditioning,
            num_lowres_steps,
        )

        if num_hires_steps > 0:
            hires_latent = LatentUpscale().upscale(
                samples=sampled_latent,
                upscale_method="bilinear",
                width=self.width,
                height=self.height,
                crop=False,
            )[0]

            sampled_latent = self.sample(
                self._hires_model if self._hires_model else self._model,
                hires_latent,
                positive_conditioning,
                negative_conditioning,
                num_hires_steps,
            )

        decoded_image = VAEDecode().decode(self._vae, sampled_latent)[0]
        return await context.image_from_tensor(decoded_image)


class ControlNet(StableDiffusion):
    """
    Generates images using Stable Diffusion with ControlNet for additional image control.
    Supports optional high-resolution upscaling while maintaining the same ControlNet strength.
    image, controlnet, generative AI, stable diffusion, high-resolution

    Use cases:
    - Generating images with specific structural guidance
    - Creating images that follow edge maps or depth information
    - Producing variations of images while maintaining certain features
    - Enhancing image generation with additional control signals
    - Creating high-resolution images with consistent controlled features
    """

    canny_image: ImageRef = Field(
        default=ImageRef(), description="Canny edge detection image for ControlNet"
    )
    depth_image: ImageRef = Field(
        default=ImageRef(), description="Depth map image for ControlNet"
    )
    canny_strength: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Strength of Canny ControlNet (used for both low and high resolution)",
    )
    depth_strength: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Strength of Depth ControlNet (used for both low and high resolution)",
    )

    _canny_controlnet: ModelPatcher | None = None
    _depth_controlnet: ModelPatcher | None = None

    async def initialize(self, context: ProcessingContext):
        await super().initialize(context)
        self._canny_controlnet = ControlNetLoader().load_controlnet(
            "coadapter-canny-sd15v1.pth"
        )[0]
        self._depth_controlnet = ControlNetLoader().load_controlnet(
            "coadapter-depth-sd15v1.pth"
        )[0]

    async def apply_controlnet(
        self, context: ProcessingContext, width: int, height: int, conditioning: list
    ):
        if not self.canny_image.is_empty():
            canny_pil = await context.image_to_pil(self.canny_image)
            canny_pil = canny_pil.resize((width, height), PIL.Image.Resampling.LANCZOS)
            canny_image = np.array(canny_pil.convert("RGB")).astype(np.float32) / 255.0
            canny_tensor = torch.from_numpy(canny_image)[None,]
            conditioning = ControlNetApply().apply_controlnet(
                conditioning,
                self._canny_controlnet,
                canny_tensor,
                self.canny_strength,
            )[0]

        if not self.depth_image.is_empty():
            depth_pil = await context.image_to_pil(self.depth_image)
            depth_pil = depth_pil.resize((width, height), PIL.Image.Resampling.LANCZOS)
            depth_image = np.array(depth_pil.convert("RGB")).astype(np.float32) / 255.0
            depth_tensor = torch.from_numpy(depth_image)[None,]
            conditioning = ControlNetApply().apply_controlnet(
                conditioning,
                self._depth_controlnet,
                depth_tensor,
                self.depth_strength,
            )[0]

        return conditioning

    async def process(self, context: ProcessingContext) -> ImageRef:
        positive_conditioning, negative_conditioning = self.get_conditioning()

        if self.width >= 1024 and self.height >= 1024:
            num_hires_steps = self.num_inference_steps // 2
            num_lowres_steps = self.num_inference_steps - num_hires_steps
            initial_width, initial_height = self.width // 2, self.height // 2
        else:
            num_hires_steps = 0
            num_lowres_steps = self.num_inference_steps
            initial_width, initial_height = self.width, self.height

        latent = await self.get_latent(context, initial_width, initial_height)

        positive_conditioning_with_controlnet = await self.apply_controlnet(
            context, initial_width, initial_height, positive_conditioning
        )

        sampled_latent = self.sample(
            self._model,
            latent,
            positive_conditioning_with_controlnet,
            negative_conditioning,
            num_lowres_steps,
        )

        if num_hires_steps > 0:
            hires_latent = LatentUpscale().upscale(
                samples=sampled_latent,
                upscale_method="bilinear",
                width=self.width,
                height=self.height,
                crop=False,
            )[0]

            hires_positive_conditioning = await self.apply_controlnet(
                context, self.width, self.height, positive_conditioning
            )

            sampled_latent = self.sample(
                self._hires_model if self._hires_model else self._model,
                hires_latent,
                hires_positive_conditioning,
                negative_conditioning,
                num_hires_steps,
            )

        decoded_image = VAEDecode().decode(self._vae, sampled_latent)[0]
        return await context.image_from_tensor(decoded_image)


class FluxModel(str, Enum):
    flux1_schnell = "flux1-schnell"
    flux1_dev = "flux1-dev"


class Flux(BaseNode):
    """
    Generates images from text prompts using a custom Stable Diffusion workflow.
    image, text-to-image, generative AI, stable diffusion, custom workflow

    Use cases:
    - Creating custom illustrations with specific model configurations
    - Generating images with fine-tuned control over the sampling process
    - Experimenting with different VAE, CLIP, and UNET combinations
    """

    model: FluxModel = Field(
        default=FluxModel.flux1_schnell, description="The Flux model to use."
    )

    prompt: str = Field(default="", description="The prompt to use.")
    width: int = Field(default=1024, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=1024, ge=64, le=2048, multiple_of=64)
    batch_size: int = Field(default=1, ge=1, le=16)
    steps: int = Field(default=4, ge=1, le=100, description="Number of sampling steps.")
    guidance_scale: float = Field(default=3.5, ge=1.0, le=30.0)
    scheduler: Scheduler = Field(default=Scheduler.simple)
    sampler: Sampler = Field(default=Sampler.euler)
    denoise: float = Field(default=1.0, ge=0.0, le=1.0)
    input_image: ImageRef = Field(
        default=ImageRef(), description="Input image for img2img (optional)"
    )
    noise_seed: int = Field(default=689015878, ge=0, le=1000000000)
    lora: LORAFile = Field(default=LORAFile(), description="The Lora model to use.")
    lora_strength: float = Field(default=0.0, ge=-100, le=100)

    _vae: Optional[VAE] = None
    _clip: Optional[CLIP] = None
    _unet: Optional[ModelPatcher] = None

    async def initialize(self, context: ProcessingContext):
        if self.model == FluxModel.flux1_schnell:
            self._unet = UNETLoader().load_unet("flux1-schnell.sft", "fp16")[0]
        elif self.model == FluxModel.flux1_dev:
            self._unet = UNETLoader().load_unet(
                "flux1-dev-fp8.safetensors", "fp8_e4m3fn"
            )[0]
        else:
            raise ValueError("No model selected")
        self._vae = VAELoader().load_vae("ae.sft")[0]
        self._clip = DualCLIPLoader().load_clip(
            "clip_l.safetensors", "t5xxl_fp8_e4m3fn.safetensors", "flux"
        )[0]

    async def move_to_device(self, device: str):
        pass

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.input_image.is_empty():
            latent = EmptyLatentImage().generate(
                self.width, self.height, self.batch_size
            )[0]
        else:
            input_pil = await context.image_to_pil(self.input_image)
            input_pil = input_pil.resize(
                (self.width, self.height), PIL.Image.Resampling.LANCZOS
            )
            image = input_pil.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            input_tensor = torch.from_numpy(image)[None,]
            latent = VAEEncode().encode(self._vae, input_tensor)[0]

        if self.lora.name != "":
            model = LoraLoaderModelOnly().load_lora_model_only(
                model=self._unet,
                lora_name=self.lora.name,
                strength_model=self.lora_strength,
            )[0]

        model = ModelSamplingFlux().patch(
            model=self._unet,
            width=self.width,
            height=self.height,
            max_shift=1.15,
            base_shift=0.5,
        )[0]

        sampler = KSamplerSelect().get_sampler(self.sampler.value)[0]
        sigmas = BasicScheduler().get_sigmas(
            model=model,
            scheduler=self.scheduler.value,
            steps=self.steps,
            denoise=self.denoise,
        )[0]

        conditioning = CLIPTextEncode().encode(self._clip, self.prompt)[0]
        conditioning = FluxGuidance().append(conditioning, self.guidance_scale)[0]

        guider = BasicGuider().get_guider(model, conditioning)[0]
        noise = RandomNoise().get_noise(self.noise_seed)[0]

        sampled_latent = SamplerCustomAdvanced().sample(
            noise, guider, sampler, sigmas, latent
        )[0]

        decoded_image = VAEDecode().decode(self._vae, sampled_latent)[0]

        return await context.image_from_tensor(decoded_image)
