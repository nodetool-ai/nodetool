from typing import Optional
import PIL.Image
import torch
import comfy
import comfy.sd
from comfy.model_patcher import ModelPatcher
from comfy_extras.nodes_flux import FluxGuidance
from comfy_extras.nodes_sd3 import EmptySD3LatentImage
import folder_paths
from nodes import (
    CLIPTextEncode,
    ControlNetApply,
    ControlNetLoader,
    EmptyLatentImage,
    KSampler,
    LatentUpscale,
    LoraLoader,
    VAEDecode,
    VAEDecodeTiled,
    VAEEncode,
    VAEEncodeForInpaint,
)
import numpy as np
from huggingface_hub import try_to_load_from_cache
from nodetool.metadata.types import (
    HFCLIP,
    HFVAE,
    HFControlNet,
    HFFlux,
    HFStableDiffusion,
    HFStableDiffusion3,
    HFStableDiffusionXL,
    HFUnet,
    ImageRef,
    LORAFile,
    LoRAConfig,
)
from nodetool.nodes.comfy.enums import Sampler, Scheduler
from nodetool.nodes.huggingface.stable_diffusion_base import (
    HF_CONTROLNET_MODELS,
    HF_STABLE_DIFFUSION_MODELS,
    HF_STABLE_DIFFUSION_XL_MODELS,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field


FLUX_VAE = HFVAE(
    repo_id="black-forest-labs/FLUX.1-schnell",
    path="ae.safetensors",
)
FLUX_CLIP_L = HFCLIP(
    repo_id="comfyanonymous/flux_text_encoders",
    path="clip_l.safetensors",
)
FLUX_CLIP_T5XXL = HFCLIP(
    repo_id="comfyanonymous/flux_text_encoders",
    path="t5xxl_fp16.safetensors",
)


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

    controlnet: HFControlNet = Field(
        default=HFControlNet(), description="The ControlNet model to use."
    )

    image: ImageRef = Field(
        default=ImageRef(), description="Canny edge detection image for ControlNet"
    )
    strength: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Strength of ControlNet (used for both low and high resolution)",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFControlNet]:
        return HF_CONTROLNET_MODELS

    async def apply_controlnet(
        self, context: ProcessingContext, width: int, height: int, conditioning: list
    ):
        if self.controlnet.is_empty():
            raise ValueError("ControlNet repository ID must be selected.")

        assert self.controlnet.path is not None, "ControlNet path must be set."

        controlnet_path = try_to_load_from_cache(
            self.controlnet.repo_id, self.controlnet.path
        )

        if controlnet_path is None:
            raise ValueError(
                "ControlNet checkpoint not found. Download from Recommended Models."
            )

        controlnet = ControlNetLoader().load_controlnet(controlnet_path)[0]
        if not self.image.is_empty():
            pil = await context.image_to_pil(self.image)
            pil = pil.resize((width, height), PIL.Image.Resampling.LANCZOS)
            image = np.array(pil.convert("RGB")).astype(np.float32) / 255.0
            tensor = torch.from_numpy(image)[None,]
            conditioning = ControlNetApply().apply_controlnet(
                conditioning,
                controlnet,
                tensor,
                self.strength,
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
        return "Flux"

    @classmethod
    def get_recommended_models(cls):
        return [
            HFUnet(
                repo_id="black-forest-labs/FLUX.1-dev",
                path="flux1-dev.safetensors",
            ),
            HFUnet(
                repo_id="black-forest-labs/FLUX.1-schnell",
                path="flux1-schnell.safetensors",
            ),
            FLUX_VAE,
            FLUX_CLIP_L,
            FLUX_CLIP_T5XXL,
        ]

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.model.is_empty():
            raise ValueError("Model must be selected.")

        assert self.model.path is not None, "Model path must be set."

        ckpt_path = try_to_load_from_cache(self.model.repo_id, self.model.path)
        assert (
            ckpt_path is not None
        ), "Flux model checkpoint not found. Download from Recommended Models."

        assert FLUX_CLIP_L.path is not None, "CLIP model path must be set."

        clip_l_path = try_to_load_from_cache(FLUX_CLIP_L.repo_id, FLUX_CLIP_L.path)

        assert (
            clip_l_path is not None
        ), "CLIP model checkpoint not found. Download from Recommended Models."

        assert FLUX_CLIP_T5XXL.path is not None, "CLIP model path must be set."

        clip_t5xxl_path = try_to_load_from_cache(
            FLUX_CLIP_T5XXL.repo_id, FLUX_CLIP_T5XXL.path
        )
        assert (
            clip_t5xxl_path is not None
        ), "Second CLIP model checkpoint not found. Download from Recommended Models."

        vae_path = try_to_load_from_cache(self.vae.repo_id, self.vae.path)
        assert (
            vae_path is not None
        ), "VAE model checkpoint not found. Download from Recommended Models."

        model = comfy.sd.load_unet(ckpt_path)

        clip = comfy.sd.load_clip(
            ckpt_paths=[clip_l_path, clip_t5xxl_path],
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
