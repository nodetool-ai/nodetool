from typing import Any
import comfy.model_management
import comfy.sd
import comfy.utils
from huggingface_hub import try_to_load_from_cache
from comfy_extras.nodes_sd3 import EmptySD3LatentImage
import folder_paths
from nodetool.common.comfy_node import ComfyNode
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
from comfy_extras.nodes_flux import FluxGuidance
from comfy_extras.nodes_model_advanced import ModelSamplingFlux
from nodes import (
    CLIPTextEncode,
    ControlNetApply,
    ControlNetLoader,
    EmptyLatentImage,
    KSampler,
    LoraLoader,
    VAEDecode,
    VAEDecodeTiled,
    VAEEncode,
    LatentUpscale,
    VAEEncodeForInpaint,
)
from comfy_extras.nodes_upscale_model import UpscaleModelLoader, ImageUpscaleWithModel
import PIL.Image
import torch

from nodetool.nodes.huggingface.stable_diffusion_base import (
    HF_STABLE_DIFFUSION_MODELS,
    HF_STABLE_DIFFUSION_XL_MODELS,
)

from .enums import Sampler, Scheduler
from comfy.model_patcher import ModelPatcher
from nodetool.metadata.types import (
    HFCLIP,
    HFVAE,
    CheckpointFile,
    HFFlux,
    HFStableDiffusion,
    HFStableDiffusion3,
    HFStableDiffusionXL,
    HFUnet,
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

    model: HFStableDiffusion = Field(
        default=HFStableDiffusion(), description="The model to use."
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
    loras: list[LoRAConfig] = Field(
        default_factory=list,
        description="List of LoRA models to apply",
    )

    _hires_model: ModelPatcher | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HFStableDiffusion]:
        return HF_STABLE_DIFFUSION_MODELS

    def apply_loras(
        self, unet: ModelPatcher, clip: comfy.sd.CLIP
    ) -> tuple[ModelPatcher, comfy.sd.CLIP]:
        for lora_config in self.loras:
            unet, clip = LoraLoader().load_lora(
                unet,
                clip,
                lora_config.lora.name,
                lora_config.strength,
                lora_config.strength,
            )  # type: ignore
        return unet, clip

    def get_empty_latent(self, width: int, height: int):
        return EmptyLatentImage().generate(width, height, 1)[0]

    async def get_latent(
        self, vae: comfy.sd.VAE, context: ProcessingContext, width: int, height: int
    ):
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
                    vae, input_tensor, mask_tensor, self.grow_mask_by
                )[0]
            else:
                return VAEEncode().encode(vae, input_tensor)[0]

    def get_conditioning(self, clip: comfy.sd.CLIP) -> tuple[list, list]:
        positive_conditioning = CLIPTextEncode().encode(clip, self.prompt)[0]
        negative_conditioning = CLIPTextEncode().encode(clip, self.negative_prompt)[0]
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
        if self.model.is_empty():
            raise ValueError("Model repository ID must be selected.")

        assert self.model.path is not None, "Model path must be set."

        ckpt_path = try_to_load_from_cache(self.model.repo_id, self.model.path)

        unet, clip, vae, _ = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=True,
            output_clip=True,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )

        assert unet is not None, "UNet must be loaded."
        assert clip is not None, "CLIP must be loaded."
        assert vae is not None, "VAE must be loaded."

        unet, clip = self.apply_loras(unet, clip)
        positive_conditioning, negative_conditioning = self.get_conditioning(clip)

        if (
            isinstance(self.model, HFStableDiffusion)
            and self.width >= 1024
            and self.height >= 1024
        ):
            num_lowres_steps = self.num_inference_steps // 4
            num_hires_steps = self.num_inference_steps - num_lowres_steps
            initial_width, initial_height = self.width // 2, self.height // 2
        else:
            num_hires_steps = 0
            num_lowres_steps = self.num_inference_steps
            initial_width, initial_height = self.width, self.height

        latent = await self.get_latent(vae, context, initial_width, initial_height)

        sampled_latent = self.sample(
            unet,
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
                unet,
                hires_latent,
                positive_conditioning,
                negative_conditioning,
                num_hires_steps,
            )

        # Unload the unet
        comfy.model_management.unload_model_clones(unet)

        decoded_image = VAEDecodeTiled().decode(vae, sampled_latent, 512)[0]
        return await context.image_from_tensor(decoded_image)


class StableDiffusionXL(StableDiffusion):
    model: HFStableDiffusionXL = Field(
        default=HFStableDiffusionXL(), description="The model to use."
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFStableDiffusionXL]:
        return HF_STABLE_DIFFUSION_XL_MODELS


class StableDiffusion3(StableDiffusion):
    """
    Generates images using Stable Diffusion 3 model.
    image, text-to-image, generative AI, stable diffusion 3

    Use cases:
    - Creating high-quality images with the latest SD3 model
    - Generating detailed and coherent images from text descriptions
    - Producing images with improved composition and understanding
    """

    model: HFStableDiffusion3 = Field(
        default=HFStableDiffusion3(), description="The model to use."
    )
    guidance_scale: float = Field(default=4.0, ge=1.0, le=30.0)
    num_inference_steps: int = Field(default=20, ge=1, le=100)

    @classmethod
    def get_title(cls) -> str:
        return "Stable Diffusion 3.5"

    @classmethod
    def get_recommended_models(cls) -> list[HFStableDiffusion3]:
        return [
            HFStableDiffusion3(
                repo_id="Comfy-Org/stable-diffusion-3.5-fp8",
                path="sd3.5_large_fp8_scaled.safetensors",
            ),
        ]

    def get_empty_latent(self, width: int, height: int):
        return EmptySD3LatentImage().generate(width, height, 1)[0]


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
        if self.model.is_empty():
            raise ValueError("Model repository ID must be selected.")

        assert self.model.path is not None, "Model path must be set."

        ckpt_path = try_to_load_from_cache(self.model.repo_id, self.model.path)

        unet, clip, vae, _ = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=True,
            output_clip=True,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )

        assert unet is not None, "UNet must be loaded."
        assert clip is not None, "CLIP must be loaded."
        assert vae is not None, "VAE must be loaded."

        positive_conditioning, negative_conditioning = self.get_conditioning(clip)

        if self.width >= 1024 and self.height >= 1024:
            num_hires_steps = self.num_inference_steps // 2
            num_lowres_steps = self.num_inference_steps - num_hires_steps
            initial_width, initial_height = self.width // 2, self.height // 2
        else:
            num_hires_steps = 0
            num_lowres_steps = self.num_inference_steps
            initial_width, initial_height = self.width, self.height

        latent = await self.get_latent(vae, context, initial_width, initial_height)

        positive_conditioning_with_controlnet = await self.apply_controlnet(
            context, initial_width, initial_height, positive_conditioning
        )

        sampled_latent = self.sample(
            unet,
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
                unet,
                hires_latent,
                hires_positive_conditioning,
                negative_conditioning,
                num_hires_steps,
            )

        decoded_image = VAEDecode().decode(vae, sampled_latent)[0]
        return await context.image_from_tensor(decoded_image)


class Flux(BaseNode):
    """
    Generates images from text prompts using the Flux model.
    image, text-to-image, generative AI, flux

    Use cases:
    - Creating high-quality anime-style illustrations
    - Generating detailed character artwork
    - Producing images with specific artistic styles
    """

    clip1: HFCLIP = Field(default=HFCLIP(), description="The first CLIP model to use.")
    clip2: HFCLIP = Field(default=HFCLIP(), description="The second CLIP model to use.")
    vae: HFVAE = Field(default=HFVAE(), description="The VAE model to use.")
    unet: HFUnet = Field(default=HFUnet(), description="The UNet model to use.")
    prompt: str = Field(default="", description="The prompt to use.")
    negative_prompt: str = Field(default="", description="The negative prompt to use.")
    width: int = Field(default=1024, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=1024, ge=64, le=2048, multiple_of=64)
    batch_size: int = Field(default=1, ge=1, le=16)
    steps: int = Field(default=20, ge=1, le=100)
    guidance_scale: float = Field(default=1.0, ge=1.0, le=30.0)
    seed: int = Field(default=0, ge=0, le=1000000000)
    denoise: float = Field(default=1.0, ge=0.0, le=1.0)
    scheduler: Scheduler = Field(default=Scheduler.simple)
    sampler: Sampler = Field(default=Sampler.euler)

    @classmethod
    def get_title(cls) -> str:
        return "Flux"

    @classmethod
    def get_recommended_models(cls):
        return [
            HFVAE(
                repo_id="black-forest-labs/FLUX.1-schnell",
                path="ae.safetensors",
            ),
            HFCLIP(
                repo_id="comfyanonymous/flux_text_encoders", path="clip_l.safetensors"
            ),
            HFCLIP(
                repo_id="comfyanonymous/flux_text_encoders",
                path="t5xxl_fp16.safetensors",
            ),
            HFUnet(
                repo_id="black-forest-labs/FLUX.1-dev",
                path="flux1-dev.safetensors",
            ),
            HFUnet(
                repo_id="black-forest-labs/FLUX.1-schnell",
                path="flux1-schnell.safetensors",
            ),
        ]

    async def process(self, context: ProcessingContext) -> ImageRef:
        if (
            self.clip1.is_empty()
            or self.clip2.is_empty()
            or self.vae.is_empty()
            or self.unet.is_empty()
        ):
            raise ValueError("All models must be selected.")

        assert self.unet.path is not None, "UNet model path must be set."
        assert self.vae.path is not None, "VAE model path must be set."
        assert self.clip1.path is not None, "First CLIP model path must be set."
        assert self.clip2.path is not None, "Second CLIP model path must be set."

        ckpt_path = try_to_load_from_cache(self.unet.repo_id, self.unet.path)
        assert (
            ckpt_path is not None
        ), "Flux model checkpoint not found. Download from Recommended Models."

        clip1_path = try_to_load_from_cache(self.clip1.repo_id, self.clip1.path)
        assert (
            clip1_path is not None
        ), "First CLIP model checkpoint not found. Download from Recommended Models."

        clip2_path = try_to_load_from_cache(self.clip2.repo_id, self.clip2.path)
        assert (
            clip2_path is not None
        ), "Second CLIP model checkpoint not found. Download from Recommended Models."

        vae_path = try_to_load_from_cache(self.vae.repo_id, self.vae.path)
        assert (
            vae_path is not None
        ), "VAE model checkpoint not found. Download from Recommended Models."

        model = comfy.sd.load_unet(ckpt_path)

        clip = comfy.sd.load_clip(
            ckpt_paths=[clip1_path, clip2_path],
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
            clip_type=comfy.sd.CLIPType.FLUX,
        )

        sd = comfy.utils.load_torch_file(vae_path)
        vae = comfy.sd.VAE(sd=sd)

        # Create empty latent
        latent = EmptySD3LatentImage().generate(
            self.width, self.height, self.batch_size
        )[0]

        # Generate conditioning
        positive = CLIPTextEncode().encode(clip, self.prompt)[0]
        negative = CLIPTextEncode().encode(clip, self.negative_prompt)[0]

        # Apply Flux guidance
        positive = FluxGuidance().append(positive, self.guidance_scale)[0]

        # Sample the image
        sampled_latent = KSampler().sample(
            model=model,
            seed=self.seed,
            steps=self.steps,
            cfg=self.guidance_scale,
            sampler_name=self.sampler.value,
            scheduler=self.scheduler.value,
            positive=positive,
            negative=negative,
            latent_image=latent,
            denoise=self.denoise,
        )[0]

        # Unload the base models
        comfy.model_management.unload_model_clones(model)

        # Decode the latent to image
        # decoded_image = VAEDecode().decode(vae, sampled_latent)[0]
        decoded_image = VAEDecodeTiled().decode(vae, sampled_latent, 512)[0]

        return await context.image_from_tensor(decoded_image)


class FluxFP8(BaseNode):
    """
    Generates images from text prompts using the Flux model.
    image, text-to-image, generative AI, flux

    Use cases:
    - Creating high-quality anime-style illustrations
    - Generating detailed character artwork
    - Producing images with specific artistic styles
    """

    model: HFFlux = Field(default=HFFlux(), description="The model to use.")
    prompt: str = Field(default="", description="The prompt to use.")
    negative_prompt: str = Field(default="", description="The negative prompt to use.")
    width: int = Field(default=1024, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=1024, ge=64, le=2048, multiple_of=64)
    batch_size: int = Field(default=1, ge=1, le=16)
    steps: int = Field(default=20, ge=1, le=100)
    guidance_scale: float = Field(default=1.0, ge=1.0, le=30.0)
    seed: int = Field(default=0, ge=0, le=1000000000)
    denoise: float = Field(default=1.0, ge=0.0, le=1.0)
    scheduler: Scheduler = Field(default=Scheduler.simple)
    sampler: Sampler = Field(default=Sampler.euler)

    @classmethod
    def get_title(cls) -> str:
        return "Flux FP8"

    @classmethod
    def get_recommended_models(cls) -> list[HFFlux]:
        return [
            HFFlux(
                repo_id="Comfy-Org/flux1-dev",
                path="flux1-dev-fp8.safetensors",
            ),
            HFFlux(
                repo_id="Comfy-Org/flux1-schnell",
                path="flux1-schnell-fp8.safetensors",
            ),
        ]

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.model.is_empty():
            raise ValueError("Model repository ID must be selected.")

        assert self.model.path is not None, "Model path must be set."

        ckpt_path = try_to_load_from_cache(self.model.repo_id, self.model.path)
        assert (
            ckpt_path is not None
        ), "Flux model checkpoint not found. Download from Recommended Models."

        # Load the base models
        model, clip, vae, _ = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=True,
            output_clip=True,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )

        # Create empty latent
        latent = EmptyLatentImage().generate(self.width, self.height, self.batch_size)[
            0
        ]

        # Generate conditioning
        positive = CLIPTextEncode().encode(clip, self.prompt)[0]
        negative = CLIPTextEncode().encode(clip, self.negative_prompt)[0]

        # Apply Flux guidance
        positive = FluxGuidance().append(positive, self.guidance_scale)[0]

        # Sample the image
        sampled_latent = KSampler().sample(
            model=model,
            seed=self.seed,
            steps=self.steps,
            cfg=self.guidance_scale,
            sampler_name=self.sampler.value,
            scheduler=self.scheduler.value,
            positive=positive,
            negative=negative,
            latent_image=latent,
            denoise=self.denoise,
        )[0]

        # Unload the base models
        comfy.model_management.unload_model_clones(model)

        # Decode the latent to image
        # decoded_image = VAEDecode().decode(vae, sampled_latent)[0]
        decoded_image = VAEDecodeTiled().decode(vae, sampled_latent, 512)[0]

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
