from typing import Any
import comfy.sd
from nodetool.common.comfy_node import ComfyNode
import nodetool.nodes.comfy
import nodetool.nodes.comfy.advanced
import nodetool.nodes.comfy.advanced.conditioning
import nodetool.nodes.comfy.advanced.loaders
import nodetool.nodes.comfy.advanced.model
import nodetool.nodes.comfy.conditioning
import nodetool.nodes.comfy.controlnet
import nodetool.nodes.comfy.controlnet.faces_and_poses
import nodetool.nodes.comfy.controlnet.semantic_segmentation
import nodetool.nodes.comfy.controlnet.normal_and_depth
import nodetool.nodes.comfy.controlnet.others
import nodetool.nodes.comfy.controlnet.line_extractors
import nodetool.nodes.comfy.controlnet.t2i
import nodetool.nodes.comfy.essentials.conditioning
import nodetool.nodes.comfy.essentials.image
import nodetool.nodes.comfy.essentials.mask
import nodetool.nodes.comfy.essentials.misc
import nodetool.nodes.comfy.essentials.sampling
import nodetool.nodes.comfy.essentials.segmentation
import nodetool.nodes.comfy.essentials.text
import nodetool.nodes.comfy.flux
import nodetool.nodes.comfy.generate
import nodetool.nodes.comfy.image
import nodetool.nodes.comfy.image.animation
import nodetool.nodes.comfy.image.batch
import nodetool.nodes.comfy.image.preprocessors
import nodetool.nodes.comfy.image.transform
import nodetool.nodes.comfy.image.upscaling
import nodetool.nodes.comfy.ipadapter
import nodetool.nodes.comfy.latent
import nodetool.nodes.comfy.latent.advanced
import nodetool.nodes.comfy.latent.batch
import nodetool.nodes.comfy.latent.inpaint
import nodetool.nodes.comfy.latent.stable_cascade
import nodetool.nodes.comfy.latent.transform
import nodetool.nodes.comfy.loaders
import nodetool.nodes.comfy.mask
import nodetool.nodes.comfy.mask.compositing
import nodetool.nodes.comfy.sampling
import nodetool.nodes.comfy.sampling.samplers
import nodetool.nodes.comfy.sampling.schedulers
import nodetool.nodes.comfy.sampling.sigmas
import nodetool.nodes.comfy.sampling.guiders
import nodetool.nodes.comfy.sampling.noise
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
from comfy_custom_nodes.ComfyUI_bitsandbytes_NF4 import CheckpointLoaderNF4
from comfy_extras.nodes_upscale_model import UpscaleModelLoader, ImageUpscaleWithModel
import PIL.Image
import torch

from .enums import Sampler, Scheduler
from comfy.model_patcher import ModelPatcher
from nodetool.metadata.types import (
    CheckpointFile,
    ImageRef,
    LORAFile,
    LoRAConfig,
    UNet,
    UNetFile,
    VAE,
    CLIP,
)
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
import numpy as np
from nodetool.metadata.types import UpscaleModelFile
from nodetool.workflows.processing_context import ProcessingContext


class PrimitiveNode(ComfyNode):
    _comfy_class = "PrimitiveNode"

    @classmethod
    def return_type(cls):
        return Any


class Note(ComfyNode):
    _comfy_class = "Note"

    @classmethod
    def is_visible(cls):
        return False


class LoRASelector(BaseNode):
    """
    Selects up to 5 LoRA models to apply to a Stable Diffusion model.
    lora, model customization, fine-tuning

    Use cases:
    - Combining multiple LoRA models for unique image styles
    - Fine-tuning Stable Diffusion models with specific attributes
    - Experimenting with different LoRA combinations
    """

    lora1: Optional[LORAFile] = Field(
        default=LORAFile(), description="First LoRA model"
    )
    strength1: Optional[float] = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for first LoRA"
    )

    lora2: Optional[LORAFile] = Field(
        default=LORAFile(), description="Second LoRA model"
    )
    strength2: Optional[float] = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for second LoRA"
    )

    lora3: Optional[LORAFile] = Field(
        default=LORAFile(), description="Third LoRA model"
    )
    strength3: Optional[float] = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for third LoRA"
    )

    lora4: Optional[LORAFile] = Field(
        default=LORAFile(), description="Fourth LoRA model"
    )
    strength4: Optional[float] = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for fourth LoRA"
    )

    lora5: Optional[LORAFile] = Field(
        default=LORAFile(), description="Fifth LoRA model"
    )
    strength5: Optional[float] = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for fifth LoRA"
    )

    async def process(self, context: ProcessingContext) -> list[LoRAConfig]:
        loras = []
        for i in range(1, 6):
            lora = getattr(self, f"lora{i}")
            strength = getattr(self, f"strength{i}")
            if lora.is_set():
                loras.append(LoRAConfig(lora=lora, strength=strength))
        return loras


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

    model: UNet = Field(default=UNet(), description="The model to use.")
    vae: VAE = Field(default=VAE(), description="The VAE to use.")
    clip: CLIP = Field(default=CLIP(), description="The CLIP to use.")
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
    loras: list[LoRAConfig] = Field(
        default_factory=list,
        description="List of LoRA models to apply",
    )

    _hires_model: ModelPatcher | None = None

    def apply_loras(self):
        for lora_config in self.loras:
            self._model, self._clip = LoraLoader().load_lora(
                self._model,
                self._clip,
                lora_config.lora.name,
                lora_config.strength,
                lora_config.strength,
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
                    self.vae.model, input_tensor, mask_tensor, self.grow_mask_by
                )[0]
            else:
                return VAEEncode().encode(self.vae.model, input_tensor)[0]

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
        self.apply_loras()
        positive_conditioning, negative_conditioning = self.get_conditioning()

        if self.width >= 1024 and self.height >= 1024:
            num_lowres_steps = self.num_inference_steps // 4
            num_hires_steps = self.num_inference_steps - num_lowres_steps
            initial_width, initial_height = self.width // 2, self.height // 2
        else:
            num_hires_steps = 0
            num_lowres_steps = self.num_inference_steps
            initial_width, initial_height = self.width, self.height

        latent = await self.get_latent(context, initial_width, initial_height)

        sampled_latent = self.sample(
            self.model.model,
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
                self.model.model,
                hires_latent,
                positive_conditioning,
                negative_conditioning,
                num_hires_steps,
            )

        decoded_image = VAEDecode().decode(self.vae.model, sampled_latent)[0]
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
            self.model.model,
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
                self.model.model,
                hires_latent,
                hires_positive_conditioning,
                negative_conditioning,
                num_hires_steps,
            )

        decoded_image = VAEDecode().decode(self.vae.model, sampled_latent)[0]
        return await context.image_from_tensor(decoded_image)


class Flux(BaseNode):
    """
    Generates images from text prompts using a custom Stable Diffusion workflow.
    image, text-to-image, generative AI, stable diffusion, custom workflow

    Use cases:
    - Creating custom illustrations with specific model configurations
    - Generating images with fine-tuned control over the sampling process
    - Experimenting with different VAE, CLIP, and UNET combinations
    """

    model: UNet = Field(default=UNet(), description="The model to use.")
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

    _vae: Optional[comfy.sd.VAE] = None
    _clip: Optional[comfy.sd.CLIP] = None

    async def initialize(self, context: ProcessingContext):
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

        model = self.model.model

        if self.lora_strength > 0.0:
            model = LoraLoaderModelOnly().load_lora_model_only(
                model=model,
                lora_name=self.lora.name,
                strength_model=self.lora_strength,
            )[0]

        model = ModelSamplingFlux().patch(
            model=model,
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


class FluxNF4(BaseNode):
    """
    Generates images from text prompts using a Flux NF4 Stable Diffusion workflow.
    image, text-to-image, generative AI, stable diffusion, flux, nf4

    Use cases:
    - Creating high-quality images with the Flux NF4 model
    - Generating images with fine-tuned control over the sampling process
    - Experimenting with Flux-specific configurations
    """

    model: UNet = Field(default=UNet(), description="The model to use.")
    clip: CLIP = Field(default=CLIP(), description="The CLIP to use.")
    prompt: str = Field(default="", description="The prompt to use.")
    width: int = Field(default=1024, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=1024, ge=64, le=2048, multiple_of=64)
    batch_size: int = Field(default=1, ge=1, le=16)
    steps: int = Field(
        default=30, ge=1, le=100, description="Number of sampling steps."
    )
    guidance_scale: float = Field(default=3.5, ge=1.0, le=30.0)
    scheduler: Scheduler = Field(default=Scheduler.simple)
    sampler: Sampler = Field(default=Sampler.euler)
    noise_seed: int = Field(default=0, ge=0, le=1000000000)
    max_shift: float = Field(default=1.15, ge=0.0, le=2.0)
    base_shift: float = Field(default=0.5, ge=0.0, le=1.0)

    _vae: Optional[comfy.sd.VAE] = None

    async def initialize(self, context: ProcessingContext):
        self._vae = VAELoader().load_vae("ae.sft")[0]

    async def process(self, context: ProcessingContext) -> ImageRef:
        latent = EmptyLatentImage().generate(self.width, self.height, self.batch_size)[
            0
        ]

        model = ModelSamplingFlux().patch(
            model=self.model.model,
            width=self.width,
            height=self.height,
            max_shift=self.max_shift,
            base_shift=self.base_shift,
        )[0]

        sampler = KSamplerSelect().get_sampler(self.sampler.value)[0]
        sigmas = BasicScheduler().get_sigmas(
            model=model,
            scheduler=self.scheduler.value,
            steps=self.steps,
            denoise=1.0,
        )[0]

        conditioning = CLIPTextEncode().encode(self.clip.model, self.prompt)[0]
        conditioning = FluxGuidance().append(conditioning, self.guidance_scale)[0]

        guider = BasicGuider().get_guider(model, conditioning)[0]
        noise = RandomNoise().get_noise(self.noise_seed)[0]

        sampled_latent = SamplerCustomAdvanced().sample(
            noise, guider, sampler, sigmas, latent
        )[0]

        decoded_image = VAEDecode().decode(self._vae, sampled_latent)[0]

        return await context.image_from_tensor(decoded_image)


# hs issues
# class UpscaleModel(BaseNode):
#     """
#     Upscales an image using a specified upscale model.
#     image, upscaling, high-resolution

#     Use cases:
#     - Enhancing the resolution of images
#     - Improving image quality for further editing or processing
#     - Creating high-resolution versions of low-resolution inputs
#     """

#     upscale_model: UpscaleModelFile = Field(
#         default=UpscaleModelFile(name="RealESRGAN_x2.pth"),
#         description="Upscale model to use.",
#     )
#     input_image: ImageRef = Field(
#         default=ImageRef(),
#         description="The image to upscale.",
#     )

#     _upscale_model: Any | None = None

#     async def initialize(self, context: ProcessingContext):
#         upscale_loader = UpscaleModelLoader()
#         self._upscale_model = upscale_loader.load_model(self.upscale_model.name)[0]

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         input_tensor = await context.image_to_torch_tensor(self.input_image)

#         upscaled_tensor = ImageUpscaleWithModel().upscale(
#             self._upscale_model, input_tensor.unsqueeze(0)
#         )[0]

#         return await context.image_from_numpy(
#             upscaled_tensor.to(dtype=torch.float16).squeeze().cpu().numpy()
#         )
