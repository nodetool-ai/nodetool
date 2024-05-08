from pydantic import Field
from nodetool.metadata.types import ImageRef
from nodetool.common.huggingface_node import HuggingfaceNode
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
    """
    Generates images from input text. These models can be used to generate and
    modify images based on text prompts.
    image, text, image generation, text-to-image, image-to-image, image generation, image synthesis

    ### Use Cases
    * Businesses can generate data for their their use cases by inputting text and getting image outputs.
    * Chatbots can be made more immersive if they provide contextual images based on the input provided by the user.
    * Different patterns can be generated to obtain unique pieces of fashion. Text-to-image models make creations easier for designers to conceptualize their design before actually implementing it.
    * Architects can utilise the models to construct an environment based out on the requirements of the floor plan. This can also include the furniture that has to be placed in that environment.
    """

    model: ModelId = Field(
        default=ModelId.STABLE_DIFFUSION_XL_BASE_1_0,
        title="Model ID on Huggingface",
        description="The model ID to use for the image generation",
    )
    inputs: str = Field(
        default="A photo of a cat.",
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
            model_id=self.model.value, context=context, params={"inputs": self.inputs}
        )
        img = await context.image_from_bytes(result)  # type: ignore
        return img
