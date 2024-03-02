from enum import Enum
from typing import Type, Literal, ClassVar
from pydantic import Field
from genflow.metadata.types import ImageRef
from genflow.nodes.replicate import ReplicateNode


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
        BASE = "base"
        ANYTHING_V3 = "anything_v3"
        PORTRAITPLUS = "portraitplus"
        REALISTIC_VISION_V5 = "realistic_vision_v5"
        ABSOLUTE_REALITY = "absolute_reality"
        DREAMSHAPER_V8 = "dreamshaper_v8"
        MAJICMIX = "majicmix"

    MODELS: ClassVar[dict[(Model, str)]] = {
        Model.BASE: "stability-ai/stable-diffusion:ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4",
        Model.REALISTIC_VISION_V5: "pagebrain/realistic-vision-v5-1:dd5c0877699000ff1f141163665473f32a997540e05a2ec1562f139e0f768155",
        Model.ANYTHING_V3: "cjwbw/anything-v3-better-vae:09a5805203f4c12da649ec1923bb7729517ca25fcac790e640eaa9ed66573b65",
        Model.PORTRAITPLUS: "cjwbw/portraitplus:629a9fe82c7979c1dab323aedac2c03adaae2e1aecf6be278a51fde0245e20a4",
        Model.ABSOLUTE_REALITY: "pagebrain/absolutereality-v1-8-1:1c9d76b62790e891aefc6c015e576a2ba27ddb08d013936a4e6d205210e2e332",
        Model.DREAMSHAPER_V8: "pagebrain/dreamshaper-v8:6cb38fe374c4fd4d5bb6a18dcdd71b08512f25bbf1753f8db4bb22f1d5fea9be",
        Model.MAJICMIX: "prompthero/majicmix:a11dab78f9dd9d9356b7b364cb93045ea89de1899543280ca9a9f4b77062b761",
    }
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
        return self.MODELS[self.model]

    @classmethod
    def return_type(cls) -> Type:
        return ImageRef


class StableDiffusionXLNode(ReplicateNode):
    """
    Stable Diffusion XL Node is a powerful tool for complex image generation and modification.
    This node adopts the Stable Diffusion XL model to perform tasks like creating images from text prompts,
    adjusting existing images, as well as providing data anonymization and augmentation through a diffusion-denoising mechanism.
    The model supports a variety of artistic styles and themes, allowing users to tailor the output to their aesthetic preferences.
    """

    class Model(str, Enum):
        BASE = "base"
        EMOJI = "emoji"
        BARBIE = "barbie"
        TRON = "tron"
        GTA_5 = "gta_5"
        HIROSHINAGAI = "hiroshinagai"
        DAVINCI = "davinci"
        NAMEH = "nameh"
        _2004 = "2004"
        _70S_SCIFI = "70s_scifi"
        VICTORIAN = "victorian"
        WOOLITIZE = "woolitize"
        JUGGERNAUT = "juggernaut"

    MODELS: ClassVar[dict[(Model, str)]] = {
        Model.BASE: "stability-ai/sdxl:ab30894f98db03761370e8af63dc75d95d3950e8dd1b71145c1c4039251a1a8a",
        Model.GTA_5: "pwntus/sdxl-gta-v:b61a50b07f8316aab4a10253692511dd2f0b6f8546113c314a0e0940dc372614",
        Model.DAVINCI: "cbh123/sdxl-davinci:ee977b1e87cb5423c16acd6525d752c05cbd288cb7f42bfe88e759a6e4487bbc",
        Model.HIROSHINAGAI: "doriandarko/sdxl-hiroshinagai:563a66acc0b39e5308e8372bed42504731b7fec3bc21f2fcbea413398690f3ec",
        Model.VICTORIAN: "davidbarker/sdxl-victorian-illustrations:4030aefc72d696ccba89e80f48bb65b6a3e663320a976f3e336fc68bd90db9e0",
        Model.NAMEH: "galleri5/nammeh:dddb29d25e750e44a553e4f869d682be050fb6efbb189981e287cc87e71486be",
        Model._2004: "fofr/sdxl-2004:54a4e82bf8357890caa42f088f64d556f21d553c98da81e59313054cd10ce714",
        Model.EMOJI: "fofr/sdxl-emoji:dee76b5afde21b0f01ed7925f0665b7e879c50ee718c5f78a9d38e04d523cc5e",
        Model.BARBIE: "fofr/sdxl-barbie:657c074cdd0e0098e39dae981194c4e852ad5bc88c7fbbeb0682afae714a6b0e",
        Model.TRON: "fofr/sdxl-tron:fd920825e12db2a942f8a9cac40ad4f624a34a06faba3ac1b44a5305df8c6e2d",
        Model.WOOLITIZE: "pwntus/sdxl-woolitize:185575e259756d1751d7b6ebd082d7cf39a6ae4bc4f436d498cb1b13882ad3b7",
        Model._70S_SCIFI: "jakedahn/sdxl-70s-scifi:426affa4cca9beb69b34c92c54133196902a4bf72dba90718f0de3124418eedb",
        Model.JUGGERNAUT: "asiryan/juggernaut-xl-v7:6a52feace43ce1f6bbc2cdabfc68423cb2319d7444a1a1dae529c5e88b976382",
    }

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
        return self.MODELS[self.model]

    @classmethod
    def return_type(cls) -> Type:
        return ImageRef


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
        return "lucataco/sdxl-controlnet:06d6fae3b75ab68a28cd2900afa6033166910dd09fd9751047043a5bbb4c184b"

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
        ..., description="The input text prompt to guide the image generation process."
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
        default=512,
        ge=64,
        le=2048,
        description="Width of the generated image in pixels.",
    )
    height: int = Field(
        default=512,
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
        return "lucataco/sdxl-lcm:fbbd475b1084de80c47c35bfe4ae64b964294aa7e237e6537eed938cfd24903d"

    @classmethod
    def return_type(cls) -> Type:
        return ImageRef
