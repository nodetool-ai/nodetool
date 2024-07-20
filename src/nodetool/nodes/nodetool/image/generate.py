import enum
from nodetool.types.sd_request import SDRequest
from nodetool.common.environment import Environment
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from pydantic import Field

from nodetool.workflows.processing_context import ProcessingContext


class Scheduler(str, enum.Enum):
    normal = "normal"
    karras = "karras"
    exponential = "exponential"
    sgm_uniform = "sgm_uniform"
    simple = "simple"
    ddim_uniform = "ddim_uniform"


class Sampler(str, enum.Enum):
    euler = "euler"
    euler_ancestral = "euler_ancestral"
    heun = "heun"
    heunpp2 = "heunpp2"
    dpm_2 = "dpm_2"
    dpm_2_ancestral = "dpm_2_ancestral"
    lms = "lms"
    dpm_fast = "dpm_fast"
    dpm_adaptive = "dpm_adaptive"
    dpmpp_2s_ancestral = "dpmpp_2s_ancestral"
    dpmpp_sde = "dpmpp_sde"
    dpmpp_sde_gpu = "dpmpp_sde_gpu"
    dpmpp_2m = "dpmpp_2m"
    dpmpp_2m_sde = "dpmpp_2m_sde"
    dpmpp_2m_sde_gpu = "dpmpp_2m_sde_gpu"
    dpmpp_3m_sde = "dpmpp_3m_sde"
    dpmpp_3m_sde_gpu = "dpmpp_3m_sde_gpu"
    ddpm = "ddpm"
    lcm = "lcm"


class StableDiffusion(BaseNode):
    prompt: str = Field(default="", description="The prompt to use.")
    negative_prompt: str = Field(default="", description="The negative prompt to use.")
    seed: int = Field(default=0, ge=0, le=1000000)
    guidance_scale: float = Field(default=7.0, ge=1.0, le=30.0)
    num_inference_steps: int = Field(default=30, ge=1, le=100)
    width: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    scheduler: Scheduler = Field(default=Scheduler.exponential)
    sampler: Sampler = Field(default=Sampler.euler_ancestral)

    async def process(self, context: ProcessingContext) -> ImageRef:
        from comfy.nodes import CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode, CheckpointLoaderSimple
        import PIL.Image
        import numpy as np
        
        checkpoint_loader = CheckpointLoaderSimple()
        model, clip, vae, _ = checkpoint_loader.load_checkpoint(  # type: ignore
            "Realistic_Vision_V6.0_NV_B1_fp16.safetensors"
        )
        # model_management.load_models_gpu([model])

        # Step 2: Encode the prompt
        clip_text_encode = CLIPTextEncode()
        positive_conditioning = clip_text_encode.encode(
            clip, self.prompt
        )[0]
        negative_conditioning = clip_text_encode.encode(
            clip, self.negative_prompt
        )[0]

        # Step 3: Create an empty latent image
        empty_latent = EmptyLatentImage()
        latent = empty_latent.generate(self.width, self.height, 1)[0]

        # Step 4: Run the sampler
        k_sampler = KSampler()
        sampled_latent = k_sampler.sample(
            model=model,
            seed=self.seed,
            steps=self.num_inference_steps,
            cfg=self.guidance_scale,
            sampler_name=self.sampler.value,
            scheduler=self.scheduler.value,
            positive=positive_conditioning,
            negative=negative_conditioning,
            latent_image=latent,
        )[0]

        # Step 5: Decode the latent image
        vae_decode = VAEDecode()
        decoded_image = vae_decode.decode(vae, sampled_latent)[0]
        img = PIL.Image.fromarray(
            np.clip(decoded_image.squeeze(0).cpu().numpy() * 255, 0, 255).astype(
                np.uint8
            )
        )

        return await context.image_from_pil(img)

    # Cleanup models (offload to CPU) after processing
