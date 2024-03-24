from enum import Enum
from typing import Type, Literal, ClassVar
from pydantic import Field
from genflow.metadata.types import ImageRef
from genflow.nodes.replicate import ReplicateNode, get_model_version


class StableDiffusionNode(ReplicateNode):
    """
    The Stable Diffusion Node is used for creating new images or modifying existing images.

    #### Example
    To generate a new natural landscape image, you can use a text description like "a sunny day in a forest with wild animals". For modifying an existing image, suppose you have a photo of a house, and you want to add a car in the driveway. Simply use a text prompt describing the desired addition, like "red car in the driveway", and the node will redraw the image to include this new element.
    """

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        K_EULER = "K_EULER"
        DPMSolverMultistep = "DPMSolverMultistep"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        PNDM = "PNDM"
        KLMS = "KLMS"

    class Model(str, Enum):
        BASE = "stability-ai/stable-diffusion"
        ABSOLUTE_REALITY = "mcai/absolutebeauty-v1.0"

    model: Model = Model.BASE
    prompt: str = Field(default="", description="The prompt to use.")
    negative_prompt: str = Field(default="", description="The negative prompt to use.")
    seed: int = Field(default=0, ge=0, le=1000000)
    guidance_scale: float = Field(default=7.0, ge=1.0, le=30.0)
    num_inference_steps: int = Field(default=30, ge=1, le=100)
    width: int = Field(default=512, ge=64, le=1024)
    height: int = Field(default=512, ge=64, le=1024)
    scheduler: Scheduler = Scheduler.DPMSolverMultistep

    def replicate_model_id(self) -> str:
        return f"{self.model.value}:{get_model_version(self.model.value)}"

    @classmethod
    def return_type(cls) -> Type:
        return ImageRef

    def get_hardware(self) -> str:
        return "Nvidia A100 (40GB) GPU"


class StableDiffusionXLNode(ReplicateNode):
    """
    Stable Diffusion XL Node is a powerful tool for complex image generation and modification.
    This node adopts the Stable Diffusion XL model to perform tasks like creating images from text prompts,
    adjusting existing images, as well as providing data anonymization and augmentation through a diffusion-denoising mechanism.
    The model supports a variety of artistic styles and themes, allowing users to tailor the output to their aesthetic preferences.
    """

    class Model(str, Enum):
        BASE = "stability-ai/sdxl"
        JUGGERNAUT = "lucataco/juggernaut-xl-v9"
        PIXAR = "swartype/sdxl-pixar"

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        K_EULER = "K_EULER"
        HeunDiscrete = "HeunDiscrete"
        DPMSolverMultistep = "DPMSolverMultistep"
        UniPCMultistep = "UniPCMultistep"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        PNDM = "PNDM"
        KLMS = "KLMS"

    class Refiner(str, Enum):
        no_refiner = "no_refiner"
        expert_ensemble_refiner = "expert_ensemble_refiner"
        base_image_refiner = "base_image_refiner"

    model: Model = Model.BASE
    prompt: str = Field(default="", description="The prompt to use.")
    negative_prompt: str = Field(default="", description="The negative prompt to use.")
    seed: int = Field(default=0, ge=0, le=1000000)
    guidance_scale: float = Field(default=7.0, ge=1.0, le=30.0)
    num_inference_steps: int = Field(default=30, ge=1, le=100)
    refine: Refiner = Refiner.no_refiner
    high_noise_frac: float = Field(default=0.8, ge=0.0, le=1.0)
    refine_steps: int = Field(default=0, ge=0, le=100)
    width: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    scheduler: Scheduler = Scheduler.DPMSolverMultistep
    image: ImageRef = ImageRef()
    mask: ImageRef = ImageRef()
    disable_safety_checker: bool = Field(default=False)

    def replicate_model_id(self) -> str:
        return f"{self.model.value}:{get_model_version(self.model.value)}"

    @classmethod
    def return_type(cls) -> Type:
        return ImageRef

    def get_hardware(self) -> str:
        return "Nvidia A40 (Large) GPU"


class StableDiffusionXLControlnetNode(ReplicateNode):
    """
    This node also employs controlnet conditioning, adding an extra layer of control over the image generation process.
    This enables users to guide the image generation or modification according to their needs. The model is efficient at
    taking a text prompt and an image, then modifying that image in line with the provided text description.
    Its novel approach proves useful when users need to translate image-to-image or generate an image from text.
    The degree of control achieved allows for a more balanced output, maintaining image quality while consistently
    following the provided instructional prompt.
    """

    prompt: str = Field(
        default="aerial view, a futuristic research complex in a bright foggy jungle, hard lighting",
        description="Input prompt guiding the image generation or modification.",
    )
    negative_prompt: str = Field(
        default="low quality, bad quality, sketches",
        description="Input Negative Prompt to specify undesired attributes or effects.",
    )
    seed: int = Field(
        default=0,
        ge=0,
        le=1000000,
        description="Random seed. Set to 0 to randomize the seed.",
    )
    condition_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Controlnet conditioning scale for generalization.",
    )
    num_inference_steps: int = Field(
        default=50, ge=1, le=100, description="Number of denoising steps."
    )
    image: ImageRef = Field(
        default=ImageRef(), description="Input image for img2img or inpaint mode."
    )

    def replicate_model_id(self) -> str:
        return (
            f"lucataco/sdxl-controlnet:{get_model_version('lucataco/sdxl-controlnet')}"
        )

    @classmethod
    def return_type(cls) -> Type:
        return ImageRef


class StableDiffusionXLLCMNode(ReplicateNode):
    """
    The Stable Diffusion XL LCM node uses an extended version of the Stable Diffusion XL model
    to generate or modify images. This node enhances the abilities of the model through
    Latent Constant Modulation (LCM), which improves the quality and resolution of the outputs.

    #### Applications
    - Generating high-resolution, detailed images from textual prompts.
    - Editing and enhancing images to match specific descriptions, potentially adding or altering elements.
    - Allowing for high levels of control and creativity in image generation or modification tasks.
    """

    class Scheduler(str, Enum):
        LCM = "LCM"
        DDIM = "DDIM"
        DPMSolverMultistep = "DPMSolverMultistep"
        HeunDiscrete = "HeunDiscrete"
        KarrasDPM = "KarrasDPM"
        K_EULER = "K_EULER"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        KLMS = "KLMS"
        PNDM = "PNDM"

    prompt: str = Field(
        "", description="The input text prompt to guide the image generation process."
    )
    negative_prompt: str = Field(
        default="",
        description="The negative prompt to guide the image generation process.",
    )
    prompt_strength: float = Field(
        default=0.75,
        ge=0.0,
        le=1.0,
        description="Prompt strength when using img2img or inpaint. 1.0 corresponds to full destruction of information in image",
    )
    seed: int = Field(
        default=0,
        ge=0,
        le=1000000,
        description="Random seed number, set to 0 for randomness.",
    )
    width: int = Field(
        default=1024,
        ge=64,
        le=2048,
        description="Width of the generated image in pixels.",
    )
    height: int = Field(
        default=1024,
        ge=64,
        le=2048,
        description="Height of the generated image in pixels.",
    )
    num_inference_steps: int = Field(
        default=6,
        ge=2,
        le=15,
        description="Number of denoising steps.",
    )
    guidance_scale: float = Field(
        default=7.0,
        ge=1.0,
        le=30.0,
        description="Parameter to control the strength of guidance from prompts.",
    )
    lora_scale: float = Field(
        default=0.6,
        ge=0.0,
        le=1.0,
        description="LoRA additive scale. Only applicable on trained models.",
    )
    image: ImageRef = ImageRef()
    mask: ImageRef = ImageRef()
    scheduler: Scheduler = Scheduler.LCM

    def replicate_model_id(self) -> str:
        return f"lucataco/sdxl-lcm:{get_model_version('lucataco/sdxl-lcm')}"

    @classmethod
    def return_type(cls) -> Type:
        return ImageRef
