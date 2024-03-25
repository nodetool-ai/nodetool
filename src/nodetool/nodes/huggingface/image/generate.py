from pydantic import Field
from nodetool.metadata.types import ImageRef
from nodetool.nodes.huggingface import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum


class Scheduler(str, Enum):
    DPMSolverSDEScheduler = "DPMSolverSDEScheduler"
    EulerDiscreteScheduler = "EulerDiscreteScheduler"
    LMSDiscreteScheduler = "LMSDiscreteScheduler"
    DDIMScheduler = "DDIMScheduler"
    DDPMScheduler = "DDPMScheduler"
    HeunDiscreteScheduler = "HeunDiscreteScheduler"
    DPMSolverMultistepScheduler = "DPMSolverMultistepScheduler"
    DEISMultistepScheduler = "DEISMultistepScheduler"
    PNDMScheduler = "PNDMScheduler"
    EulerAncestralDiscreteScheduler = "EulerAncestralDiscreteScheduler"
    UniPCMultistepScheduler = "UniPCMultistepScheduler"
    KDPM2DiscreteScheduler = "KDPM2DiscreteScheduler"
    DPMSolverSinglestepScheduler = "DPMSolverSinglestepScheduler"
    KDPM2AncestralDiscreteScheduler = "KDPM2AncestralDiscreteScheduler"


class ModelId(str, Enum):
    STABLE_DIFFUSION_XL_BASE_1_0 = "stabilityai/stable-diffusion-xl-base-1.0"
    CAGLIOSTRO_ANIMAGINE_XL_3_0 = "cagliostrolab/animagine-xl-3.0"
    NERIJS_PIXEL_ART_XL = "nerijs/pixel-art-xl"
    STABLE_DIFFUSION_XL_V8 = "stablediffusionapi/juggernaut-xl-v8"


class StableDiffusionXL(HuggingfaceNode):
    model: ModelId = Field(
        default=ModelId.STABLE_DIFFUSION_XL_BASE_1_0,
        title="Model ID on Huggingface",
        description="The model ID to use for the image generation",
    )
    inputs: str = Field(
        title="Inputs",
        description="The input text to the model",
    )

    negative_prompt: str = Field(default="", description="The negative prompt to use.")
    seed: int = Field(default=0, ge=0, le=1000000)
    guidance_scale: float = Field(default=7.0, ge=1.0, le=30.0)
    num_inference_steps: int = Field(default=30, ge=1, le=100)
    width: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    scheduler: Scheduler = Scheduler.EulerDiscreteScheduler

    async def process(self, context: ProcessingContext) -> ImageRef:
        result = await self.run_huggingface(
            model_id=self.model, context=context, params={"inputs": self.inputs}
        )
        img = await context.image_from_bytes(result)  # type: ignore
        return img
