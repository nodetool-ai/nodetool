from typing import Optional
import PIL.Image
from comfy.model_patcher import ModelPatcher
from comfy.sd import CLIP, VAE
from nodetool.metadata.types import CheckpointFile, ImageRef
from nodetool.nodes.stable_diffusion.enums import Sampler, Scheduler
from nodetool.workflows.base_node import BaseNode
from pydantic import Field

from nodetool.workflows.processing_context import ProcessingContext


class SD_Img2Img(BaseNode):
    """
    Generates images based on an input image and text prompts using Stable Diffusion.
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
    input_image: Optional[ImageRef] = Field(default=None, description="Input image for img2img (optional)")
    denoise: float = Field(default=0.0, ge=0.0, le=1.0)
    
    _model: ModelPatcher | None = None
    _clip: CLIP | None = None
    _vae: VAE | None = None
    
    async def initialize(self, context: ProcessingContext):
        from comfy.nodes import CheckpointLoaderSimple
        checkpoint_loader = CheckpointLoaderSimple()
        self._model, self._clip, self._vae, _ = checkpoint_loader.load_checkpoint( # type: ignore
            self.model.name
        )

    async def process(self, context: ProcessingContext) -> ImageRef:
        from comfy.nodes import CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode, VAEEncode
        import PIL.Image
        import numpy as np
        import torch
        
        clip_text_encode = CLIPTextEncode()
        positive_conditioning = clip_text_encode.encode(
            self._clip, self.prompt
        )[0]
        negative_conditioning = clip_text_encode.encode(
            self._clip, self.negative_prompt
        )[0]

        if self.input_image:
            # Load and preprocess the input image
            input_pil = await context.image_to_pil(self.input_image)
            input_pil = input_pil.resize((self.width, self.height), PIL.Image.Resampling.LANCZOS)
            image = input_pil.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            input_tensor = torch.from_numpy(image)[None,]

            # Encode the input image to latent space
            vae_encode = VAEEncode()
            latent = vae_encode.encode(self._vae, input_tensor)[0]
        else:
            # If no input image, create an empty latent
            empty_latent = EmptyLatentImage()
            latent = empty_latent.generate(self.width, self.height, 1)[0]

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
            denoise=self.denoise
        )[0]

        vae_decode = VAEDecode()
        decoded_image = vae_decode.decode(self._vae, sampled_latent)[0]
        img = PIL.Image.fromarray(
            np.clip(decoded_image.squeeze(0).cpu().numpy() * 255, 0, 255).astype(
                np.uint8
            )
        )

        return await context.image_from_pil(img)
    


class SD_ControlNet(BaseNode):
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
    input_image: Optional[ImageRef] = Field(default=None, description="Input image for img2img (optional)")
    denoise: float = Field(default=0.0, ge=0.0, le=1.0)
    canny_image: Optional[ImageRef] = Field(default=None, description="Canny edge detection image for ControlNet")
    depth_image: Optional[ImageRef] = Field(default=None, description="Depth map image for ControlNet")
    canny_strength: float = Field(default=1.0, ge=0.0, le=1.0, description="Strength of Canny ControlNet")
    depth_strength: float = Field(default=1.0, ge=0.0, le=1.0, description="Strength of Depth ControlNet")
    
    _model: ModelPatcher | None = None
    _clip: CLIP | None = None
    _vae: VAE | None = None
    _canny_controlnet: ModelPatcher | None = None
    _depth_controlnet: ModelPatcher | None = None
    
    async def initialize(self, context: ProcessingContext):
        from comfy.nodes import CheckpointLoaderSimple, ControlNetLoader
        checkpoint_loader = CheckpointLoaderSimple()
        self._model, self._clip, self._vae, _ = checkpoint_loader.load_checkpoint( # type: ignore
            self.model.name
        )
        
        controlnet_loader = ControlNetLoader()
        self._canny_controlnet = controlnet_loader.load_controlnet("coadapter-canny-sd15v1.pth")[0]
        self._depth_controlnet = controlnet_loader.load_controlnet("coadapter-depth-sd15v1.pth")[0]

    async def process(self, context: ProcessingContext) -> ImageRef:
        from comfy.nodes import CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode, VAEEncode, ControlNetApply
        import PIL.Image
        import numpy as np
        import torch
        
        clip_text_encode = CLIPTextEncode()
        positive_conditioning = clip_text_encode.encode(
            self._clip, self.prompt
        )[0]
        negative_conditioning = clip_text_encode.encode(
            self._clip, self.negative_prompt
        )[0]

        if self.input_image:
            input_pil = await context.image_to_pil(self.input_image)
            input_pil = input_pil.resize((self.width, self.height), PIL.Image.Resampling.LANCZOS)
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
            canny_pil = canny_pil.resize((self.width, self.height), PIL.Image.Resampling.LANCZOS)
            canny_image = np.array(canny_pil.convert("RGB")).astype(np.float32) / 255.0
            canny_tensor = torch.from_numpy(canny_image)[None,]
            control_nets.append(self._canny_controlnet)
            control_hints.append(canny_tensor)
            control_strengths.append(self.canny_strength)

        if self.depth_image:
            depth_pil = await context.image_to_pil(self.depth_image)
            depth_pil = depth_pil.resize((self.width, self.height), PIL.Image.Resampling.LANCZOS)
            depth_image = np.array(depth_pil.convert("RGB")).astype(np.float32) / 255.0
            depth_tensor = torch.from_numpy(depth_image)[None,]
            control_nets.append(self._depth_controlnet)
            control_hints.append(depth_tensor)
            control_strengths.append(self.depth_strength)

        controlnet_apply = ControlNetApply()
        for controlnet, hint, strength in zip(control_nets, control_hints, control_strengths):
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
            denoise=self.denoise
        )[0]

        vae_decode = VAEDecode()
        decoded_image = vae_decode.decode(self._vae, sampled_latent)[0]
        img = PIL.Image.fromarray(
            np.clip(decoded_image.squeeze(0).cpu().numpy() * 255, 0, 255).astype(
                np.uint8
            )
        )

        return await context.image_from_pil(img)