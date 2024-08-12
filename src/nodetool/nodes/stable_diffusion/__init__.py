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
from nodes import (
    CLIPTextEncode,
    CheckpointLoaderSimple,
    ControlNetLoader,
    DualCLIPLoader,
    EmptyLatentImage,
    KSampler,
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
from comfy_extras.nodes_sd3 import EmptySD3LatentImage
from nodetool.metadata.types import CheckpointFile, ImageRef
from nodetool.nodes.stable_diffusion.enums import Sampler, Scheduler
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
import numpy as np

from nodetool.workflows.processing_context import ProcessingContext


class StableDiffusion(BaseNode):
    """
    Generates images based on an input image and text prompts using Stable Diffusion.
    Works with 1.5 and XL models.
    image, image-to-image, generative AI, stable diffusion

    Use cases:
    - Modifying existing images based on text descriptions
    - Applying artistic styles to photographs
    - Generating variations of existing artwork or designs
    - Enhancing or altering stock images for specific needs
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

    async def initialize(self, context: ProcessingContext):
        from nodes import CheckpointLoaderSimple

        checkpoint_loader = CheckpointLoaderSimple()
        self._model, self._clip, self._vae = checkpoint_loader.load_checkpoint(
            self.model.name
        )

    async def process(self, context: ProcessingContext) -> ImageRef:
        positive_conditioning = CLIPTextEncode().encode(self._clip, self.prompt)[0]
        negative_conditioning = CLIPTextEncode().encode(
            self._clip, self.negative_prompt
        )[0]

        if self.input_image.is_empty():
            latent = EmptyLatentImage().generate(self.width, self.height, 1)[0]
        else:
            input_pil = await context.image_to_pil(self.input_image)
            input_pil = input_pil.resize(
                (self.width, self.height), PIL.Image.Resampling.LANCZOS
            )
            image = input_pil.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            input_tensor = torch.from_numpy(image)[None,]

            if not self.mask_image.is_empty():
                mask_pil = await context.image_to_pil(self.mask_image)
                mask_pil = mask_pil.resize(
                    (self.width, self.height), PIL.Image.Resampling.LANCZOS
                )
                mask = mask_pil.convert("L")
                mask = np.array(mask).astype(np.float32) / 255.0
                mask_tensor = torch.from_numpy(mask)[None,]
                latent = VAEEncodeForInpaint().encode(
                    self._vae, input_tensor, mask_tensor, self.grow_mask_by
                )[0]
            else:
                latent = VAEEncode().encode(self._vae, input_tensor)[0]

        sampled_latent = KSampler().sample(
            model=self._model,
            seed=self.seed,
            steps=self.num_inference_steps,
            cfg=self.guidance_scale,
            sampler_name=self.sampler.value,
            scheduler=self.scheduler.value,
            positive=positive_conditioning,
            negative=negative_conditioning,
            latent_image=latent,
        )[0]

        decoded_image = VAEDecode().decode(self._vae, sampled_latent)[0]
        img = PIL.Image.fromarray(
            np.clip(decoded_image.squeeze(0).cpu().numpy() * 255, 0, 255).astype(
                np.uint8
            )
        )

        return await context.image_from_pil(img)


class HiResStableDiffusion(StableDiffusion):
    """
    Generates high-resolution images based on an input image and text prompts using Stable Diffusion.
    Works with 1.5 and XL models.
    image, image-to-image, generative AI, stable diffusion

    Use cases:
    - Modifying existing images based on text descriptions
    - Applying artistic styles to photographs
    - Generating variations of existing artwork or designs
    - Enhancing or altering stock images for specific needs
    """

    hires_model: CheckpointFile = Field(
        default=CheckpointFile(), description="Hires model checkpoint to load."
    )
    num_hires_steps: int = Field(default=0, ge=0, le=100)
    hires_denoise: float = Field(default=0.7, ge=0.0, le=1.0)

    _hires_model: ModelPatcher | None = None

    async def initialize(self, context: ProcessingContext):
        checkpoint_loader = CheckpointLoaderSimple()
        self._model, self._clip, self._vae = checkpoint_loader.load_checkpoint(
            self.model.name
        )

        self._hires_model, _, _ = checkpoint_loader.load_checkpoint(
            self.hires_model.name
        )

    async def process(self, context: ProcessingContext) -> ImageRef:
        clip_text_encode = CLIPTextEncode()
        positive_conditioning = clip_text_encode.encode(self._clip, self.prompt)[0]
        negative_conditioning = clip_text_encode.encode(
            self._clip, self.negative_prompt
        )[0]

        if self.input_image.is_empty():
            # If no input image, create an empty latent
            empty_latent = EmptyLatentImage()
            latent = empty_latent.generate(self.width, self.height, 1)[0]
        else:
            # Load and preprocess the input image
            input_pil = await context.image_to_pil(self.input_image)
            input_pil = input_pil.resize(
                (self.width, self.height), PIL.Image.Resampling.LANCZOS
            )
            image = input_pil.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            input_tensor = torch.from_numpy(image)[None,]

            # Encode the input image to latent space
            vae_encode = VAEEncode()
            latent = vae_encode.encode(self._vae, input_tensor)[0]

        if self.num_hires_steps > 0:
            width = self.width // 2
            height = self.height // 2
        else:
            width = self.width
            height = self.height

        latent = empty_latent.generate(width, height, 1)[0]

        k_sampler = KSampler()
        sampled_latent = k_sampler.sample(
            model=self._model,
            seed=self.seed,
            steps=self.num_inference_steps,
            cfg=self.guidance_scale,
            sampler_name=self.sampler.value,
            scheduler=self.scheduler.value,
            positive=positive_conditioning,
            negative=negative_conditioning,
            latent_image=latent,
        )[0]

        if self.num_hires_steps > 0:
            hires_latent = LatentUpscale().upscale(
                samples=sampled_latent,
                upscale_method="bilinear",
                width=self.width * 2,
                height=self.height * 2,
                crop=False,
            )[0]

            sampled_latent = k_sampler.sample(
                model=self._hires_model if self._hires_model else self._model,
                seed=self.seed,
                steps=self.num_hires_steps,
                cfg=self.guidance_scale,
                sampler_name=self.sampler.value,
                scheduler=self.scheduler.value,
                positive=positive_conditioning,
                negative=negative_conditioning,
                latent_image=hires_latent,
                denoise=self.hires_denoise,
            )[0]

        vae_decode = VAEDecode()
        decoded_image = vae_decode.decode(self._vae, sampled_latent)[0]
        img = PIL.Image.fromarray(
            np.clip(decoded_image.squeeze(0).cpu().numpy() * 255, 0, 255).astype(
                np.uint8
            )
        )

        return await context.image_from_pil(img)


class ControlNet(BaseNode):
    """
    Generates images using Stable Diffusion with ControlNet for additional image control.
    image, controlnet, generative AI, stable diffusion

    Use cases:
    - Generating images with specific structural guidance
    - Creating images that follow edge maps or depth information
    - Producing variations of images while maintaining certain features
    - Enhancing image generation with additional control signals
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
    input_image: Optional[ImageRef] = Field(
        default=None, description="Input image for img2img (optional)"
    )
    denoise: float = Field(default=0.0, ge=0.0, le=1.0)
    canny_image: Optional[ImageRef] = Field(
        default=None, description="Canny edge detection image for ControlNet"
    )
    depth_image: Optional[ImageRef] = Field(
        default=None, description="Depth map image for ControlNet"
    )
    canny_strength: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Strength of Canny ControlNet"
    )
    depth_strength: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Strength of Depth ControlNet"
    )

    _model: ModelPatcher | None = None
    _clip: CLIP | None = None
    _vae: VAE | None = None
    _canny_controlnet: ModelPatcher | None = None
    _depth_controlnet: ModelPatcher | None = None

    async def initialize(self, context: ProcessingContext):
        checkpoint_loader = CheckpointLoaderSimple()
        self._model, self._clip, self._vae = checkpoint_loader.load_checkpoint(  # type: ignore
            self.model.name
        )

        controlnet_loader = ControlNetLoader()
        self._canny_controlnet = controlnet_loader.load_controlnet(
            "coadapter-canny-sd15v1.pth"
        )[0]
        self._depth_controlnet = controlnet_loader.load_controlnet(
            "coadapter-depth-sd15v1.pth"
        )[0]

    async def process(self, context: ProcessingContext) -> ImageRef:
        from nodes import (
            CLIPTextEncode,
            EmptyLatentImage,
            KSampler,
            VAEDecode,
            VAEEncode,
            ControlNetApply,
        )
        import PIL.Image
        import numpy as np
        import torch

        clip_text_encode = CLIPTextEncode()
        positive_conditioning = clip_text_encode.encode(self._clip, self.prompt)[0]
        negative_conditioning = clip_text_encode.encode(
            self._clip, self.negative_prompt
        )[0]

        if self.input_image:
            input_pil = await context.image_to_pil(self.input_image)
            input_pil = input_pil.resize(
                (self.width, self.height), PIL.Image.Resampling.LANCZOS
            )
            image = input_pil.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            input_tensor = torch.from_numpy(image)[None,]

            vae_encode = VAEEncode()
            latent = vae_encode.encode(self._vae, input_tensor)[0]
        else:
            empty_latent = EmptyLatentImage()
            latent = empty_latent.generate(self.width, self.height, 1)[0]

        control_nets = []
        control_hints = []
        control_strengths = []

        if self.canny_image:
            canny_pil = await context.image_to_pil(self.canny_image)
            canny_pil = canny_pil.resize(
                (self.width, self.height), PIL.Image.Resampling.LANCZOS
            )
            canny_image = np.array(canny_pil.convert("RGB")).astype(np.float32) / 255.0
            canny_tensor = torch.from_numpy(canny_image)[None,]
            control_nets.append(self._canny_controlnet)
            control_hints.append(canny_tensor)
            control_strengths.append(self.canny_strength)

        if self.depth_image:
            depth_pil = await context.image_to_pil(self.depth_image)
            depth_pil = depth_pil.resize(
                (self.width, self.height), PIL.Image.Resampling.LANCZOS
            )
            depth_image = np.array(depth_pil.convert("RGB")).astype(np.float32) / 255.0
            depth_tensor = torch.from_numpy(depth_image)[None,]
            control_nets.append(self._depth_controlnet)
            control_hints.append(depth_tensor)
            control_strengths.append(self.depth_strength)

        controlnet_apply = ControlNetApply()
        for controlnet, hint, strength in zip(
            control_nets, control_hints, control_strengths
        ):
            positive_conditioning = controlnet_apply.apply_controlnet(
                positive_conditioning, controlnet, hint, strength
            )[0]

        k_sampler = KSampler()
        sampled_latent = k_sampler.sample(
            model=self._model,
            seed=self.seed,
            steps=self.num_inference_steps,
            cfg=self.guidance_scale,
            sampler_name=self.sampler.value,
            scheduler=self.scheduler.value,
            positive=positive_conditioning,
            negative=negative_conditioning,
            latent_image=latent,
            denoise=self.denoise,
        )[0]

        vae_decode = VAEDecode()
        decoded_image = vae_decode.decode(self._vae, sampled_latent)[0]
        img = PIL.Image.fromarray(
            np.clip(decoded_image.squeeze(0).cpu().numpy() * 255, 0, 255).astype(
                np.uint8
            )
        )

        return await context.image_from_pil(img)


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
    realism_strength: float = Field(default=0.0, ge=0.0, le=1.0)
    scheduler: Scheduler = Field(default=Scheduler.simple)
    sampler: Sampler = Field(default=Sampler.euler)
    noise_seed: int = Field(default=689015878, ge=0, le=1000000000)

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

    async def process(self, context: ProcessingContext) -> ImageRef:
        empty_latent = EmptyLatentImage().generate(
            self.width, self.height, self.batch_size
        )[0]

        conditioning = CLIPTextEncode().encode(self._clip, self.prompt)[0]
        conditioning = FluxGuidance().append(conditioning, self.guidance_scale)[0]

        # Set up sampler and scheduler
        sampler = KSamplerSelect().get_sampler(self.sampler.value)[0]
        sigmas = BasicScheduler().get_sigmas(
            self._unet,
            self.scheduler.value,
            self.steps,
            1,
        )[0]
        model = LoraLoaderModelOnly().load_lora_model_only(
            self._unet,
            "xlabs_flux_realism_lora_comfui.safetensors",
            self.realism_strength,
        )[0]

        guider = BasicGuider().get_guider(model, conditioning)[0]
        noise = RandomNoise().get_noise(self.noise_seed)[0]

        sampled_latent = SamplerCustomAdvanced().sample(
            noise, guider, sampler, sigmas, empty_latent
        )[0]

        decoded_image = VAEDecode().decode(self._vae, sampled_latent)[0]

        img = PIL.Image.fromarray(
            np.clip(decoded_image.squeeze(0).cpu().numpy() * 255, 0, 255).astype(  # type: ignore
                np.uint8
            )
        )

        return await context.image_from_pil(img)
