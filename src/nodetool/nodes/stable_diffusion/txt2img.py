from comfy.model_patcher import ModelPatcher
from comfy.nodes import LatentUpscale
from comfy.sd import CLIP, VAE
from nodetool.metadata.types import CheckpointFile, ImageRef
from nodetool.nodes.stable_diffusion.enums import Sampler, Scheduler
from nodetool.workflows.base_node import BaseNode
from pydantic import Field

from nodetool.workflows.processing_context import ProcessingContext


class SD_Txt2Img(BaseNode):
    """
    Generates images from text prompts using Stable Diffusion.
    image, text-to-image, generative AI, stable diffusion

    Use cases:
    - Creating custom illustrations for various purposes
    - Generating concept art for games, films, or other creative projects
    - Visualizing design ideas or architectural concepts
    - Producing unique images for marketing and advertising materials
    """
    model: CheckpointFile = Field(
        default=CheckpointFile(), description="Stable Diffusion checkpoint to load."
    )
    prompt: str = Field(default="", description="The prompt to use.")
    negative_prompt: str = Field(default="", description="The negative prompt to use.")
    seed: int = Field(default=0, ge=0, le=1000000)
    guidance_scale: float = Field(default=7.0, ge=1.0, le=30.0)
    num_inference_steps: int = Field(default=30, ge=1, le=100, description="Number of inference steps.")
    num_hires_steps: int = Field(default=0, ge=0, le=100, description="Number of high resolution steps. If 0, no high resolution steps are taken.")
    hires_denoise: float = Field(default=0.5, ge=0.0, le=1.0, description="Denoising strength for high resolution steps.")
    width: int = Field(default=512, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=512, ge=64, le=2048, multiple_of=64)
    scheduler: Scheduler = Field(default=Scheduler.exponential)
    sampler: Sampler = Field(default=Sampler.euler_ancestral)
    
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
        from comfy.nodes import CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode, CheckpointLoaderSimple
        import PIL.Image
        import numpy as np
        
        clip_text_encode = CLIPTextEncode()
        positive_conditioning = clip_text_encode.encode(
            self._clip, self.prompt
        )[0]
        negative_conditioning = clip_text_encode.encode(
            self._clip, self.negative_prompt
        )[0]

        empty_latent = EmptyLatentImage()
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
                upscale_method="nearest-exact",
                width=self.width,
                height=self.height,
                crop=False
            )[0]

            sampled_latent = k_sampler.sample(
                model=self._model,
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
    