from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AuraFlowV03(GraphNode):
    """
    AuraFlow v0.3 is an open-source flow-based text-to-image generation model that achieves state-of-the-art results on GenEval.
    image, generation, flow-based, text-to-image, txt2img

    Use cases:
    - Generate high-quality images
    - Create artistic visualizations
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='Classifier free guidance scale')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of inference steps to take')
    expand_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to perform prompt expansion (recommended)')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The seed to use for generating images')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.AuraFlowV03"


import nodetool.nodes.fal.text_to_image

class BriaV1(GraphNode):
    """
    Bria's Text-to-Image model, trained exclusively on licensed data for safe and risk-free commercial use.
    Features exceptional image quality and commercial licensing safety.
    """

    AspectRatio: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.BriaV1.AspectRatio
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to avoid certain elements in the generated image')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='How many images to generate. When using guidance, value is set to 1')
    aspect_ratio: nodetool.nodes.fal.text_to_image.BriaV1.AspectRatio = Field(default=AspectRatio.RATIO_1_1, description='The aspect ratio of the image. Ignored when guidance is used')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='The number of iterations for refining the generated image')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='How closely the model should stick to your prompt (CFG scale)')
    prompt_enhancement: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='When true, enhances the prompt with more descriptive variations')
    medium: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Optional medium specification ('photography' or 'art')")
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.BriaV1"


import nodetool.nodes.fal.text_to_image

class BriaV1Fast(GraphNode):
    """
    Bria's Text-to-Image model with perfect harmony of latency and quality.
    Trained exclusively on licensed data for safe and risk-free commercial use.
    Features faster inference times while maintaining high image quality.
    """

    AspectRatio: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.BriaV1Fast.AspectRatio
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to avoid certain elements in the generated image')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='How many images to generate. When using guidance, value is set to 1')
    aspect_ratio: nodetool.nodes.fal.text_to_image.BriaV1Fast.AspectRatio = Field(default=AspectRatio.RATIO_1_1, description='The aspect ratio of the image. Ignored when guidance is used')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='The number of iterations for refining the generated image')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='How closely the model should stick to your prompt (CFG scale)')
    prompt_enhancement: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='When true, enhances the prompt with more descriptive variations')
    medium: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Optional medium specification ('photography' or 'art')")
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.BriaV1Fast"


import nodetool.nodes.fal.text_to_image

class BriaV1HD(GraphNode):
    """
    Bria's Text-to-Image model for HD images. Trained exclusively on licensed data for safe and risk-free commercial use. Features exceptional image quality and commercial licensing safety.
    image, generation, hd, text-to-image, txt2img

    Use cases:
    - Create commercial marketing materials
    - Generate licensed artwork
    - Produce high-definition visuals
    - Design professional content
    - Create legally safe visual assets
    """

    AspectRatio: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.BriaV1HD.AspectRatio
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to avoid certain elements in the generated image')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='How many images to generate. When using guidance, value is set to 1')
    aspect_ratio: nodetool.nodes.fal.text_to_image.BriaV1HD.AspectRatio = Field(default=AspectRatio.RATIO_1_1, description='The aspect ratio of the image. Ignored when guidance is used')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='The number of iterations for refining the generated image')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='How closely the model should stick to your prompt (CFG scale)')
    prompt_enhancement: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='When true, enhances the prompt with more descriptive variations')
    medium: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Optional medium specification ('photography' or 'art')")
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The seed to use for generating images')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.BriaV1HD"



class DiffusionEdge(GraphNode):
    """
    Diffusion Edge is a diffusion-based high-quality edge detection model that generates
    edge maps from input images.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to detect edges from')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.DiffusionEdge"


import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image

class FastLCMDiffusion(GraphNode):
    """
    Fast Latent Consistency Models (v1.5/XL) Text to Image runs SDXL at the speed of light,
    enabling rapid and high-quality image generation.
    """

    ModelNameFastLCM: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FastLCMDiffusion.ModelNameFastLCM
    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FastLCMDiffusion.ImageSizePreset
    SafetyCheckerVersion: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FastLCMDiffusion.SafetyCheckerVersion
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    model_name: nodetool.nodes.fal.text_to_image.FastLCMDiffusion.ModelNameFastLCM = Field(default=ModelNameFastLCM.SDXL_BASE, description='The name of the model to use')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    image_size: nodetool.nodes.fal.text_to_image.FastLCMDiffusion.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=6, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.5, description='How closely the model should stick to your prompt')
    sync_mode: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, wait for image generation and upload before returning')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')
    safety_checker_version: nodetool.nodes.fal.text_to_image.FastLCMDiffusion.SafetyCheckerVersion = Field(default=SafetyCheckerVersion.V1, description='The version of the safety checker to use')
    expand_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='If true, the prompt will be expanded with additional prompts')
    guidance_rescale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The rescale factor for the CFG')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FastLCMDiffusion"


import nodetool.nodes.fal.text_to_image

class FastLightningSDXL(GraphNode):
    """
    Stable Diffusion XL Lightning Text to Image runs SDXL at the speed of light, enabling
    ultra-fast high-quality image generation.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FastLightningSDXL.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FastLightningSDXL.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='The number of inference steps to perform (1, 2, 4, or 8)')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')
    expand_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='If true, the prompt will be expanded with additional prompts')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FastLightningSDXL"


import nodetool.nodes.fal.text_to_image

class FastSDXL(GraphNode):
    """
    Fast SDXL is a high-performance text-to-image model that runs SDXL at exceptional speeds
    while maintaining high-quality output.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FastSDXL.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    image_size: nodetool.nodes.fal.text_to_image.FastSDXL.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='How closely the model should stick to your prompt (CFG scale)')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')
    expand_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='If true, the prompt will be expanded with additional prompts')
    loras: List | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The list of LoRA weights to use')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FastSDXL"


import nodetool.nodes.fal.text_to_image

class FastSDXLControlNetCanny(GraphNode):
    """
    Fast SDXL ControlNet Canny is a model that generates images using ControlNet with SDXL.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FastSDXLControlNetCanny.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The control image to use for generation')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='How closely the model should stick to your prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='The number of inference steps to perform')
    image_size: nodetool.nodes.fal.text_to_image.FastSDXLControlNetCanny.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FastSDXLControlNetCanny"


import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image

class FastTurboDiffusion(GraphNode):
    """
    Fast Turbo Diffusion runs SDXL at exceptional speeds while maintaining high-quality output.
    Supports both SDXL Turbo and SD Turbo models for ultra-fast image generation.
    """

    ModelNameEnum: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FastTurboDiffusion.ModelNameEnum
    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FastTurboDiffusion.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    model_name: nodetool.nodes.fal.text_to_image.FastTurboDiffusion.ModelNameEnum = Field(default=ModelNameEnum.SDXL_TURBO, description='The name of the model to use')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    image_size: nodetool.nodes.fal.text_to_image.FastTurboDiffusion.ImageSizePreset = Field(default=ImageSizePreset.SQUARE, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='How closely the model should stick to your prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')
    expand_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='If true, the prompt will be expanded with additional prompts')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FastTurboDiffusion"


import nodetool.nodes.fal.text_to_image

class FluxDev(GraphNode):
    """
    FLUX.1 [dev] is a 12 billion parameter flow transformer that generates high-quality images from text.
    It is suitable for personal and commercial use.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxDev.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxDev.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='Either a preset size or a custom {width, height} dictionary')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxDev"



class FluxDevImageToImage(GraphNode):
    """
    FLUX.1 [dev] Image-to-Image is a high-performance endpoint that enables rapid transformation
    of existing images, delivering high-quality style transfers and image modifications with
    the core FLUX capabilities.
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to transform')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The strength of the initial image. Higher strength values are better for this model')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='How closely the model should stick to your prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxDevImageToImage"


import nodetool.nodes.fal.text_to_image

class FluxGeneral(GraphNode):
    """
    FLUX.1 [dev] with Controlnets and Loras is a versatile text-to-image model that supports multiple AI extensions including LoRA, ControlNet conditioning, and IP-Adapter integration, enabling comprehensive control over image generation through various guidance methods.
    image, generation, controlnet, lora, ip-adapter, text-to-image, txt2img

    Use cases:
    - Create controlled image generations
    - Apply multiple AI extensions
    - Generate guided visual content
    - Produce customized artwork
    - Design with precise control
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxGeneral.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxGeneral.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='How closely the model should stick to your prompt (CFG scale)')
    real_cfg_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='Classical CFG scale as in SD1.5, SDXL, etc.')
    use_real_cfg: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Uses classical CFG. Increases generation times and price when true')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')
    reference_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.65, description='Strength of reference_only generation. Only used if a reference image is provided')
    reference_end: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The percentage of total timesteps when reference guidance should end')
    base_shift: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Base shift for the scheduled timesteps')
    max_shift: float | GraphNode | tuple[GraphNode, str] = Field(default=1.15, description='Max shift for the scheduled timesteps')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxGeneral"


import nodetool.nodes.fal.text_to_image

class FluxLora(GraphNode):
    """
    FLUX.1 [dev] with LoRAs is a text-to-image model that supports LoRA adaptations, enabling rapid and high-quality image generation with pre-trained LoRA weights for personalization, specific styles, brand identities, and product-specific outputs.
    image, generation, lora, personalization, style-transfer, text-to-image, txt2img

    Use cases:
    - Create brand-specific visuals
    - Generate custom styled images
    - Adapt existing styles to new content
    - Produce personalized artwork
    - Design consistent visual identities
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxLora.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxLora.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='Either a preset size or a custom {width, height} dictionary')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='The CFG scale to determine how closely the model follows the prompt')
    loras: List | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of LoRA weights to use for image generation')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxLora"



class FluxLoraInpainting(GraphNode):
    """
    FLUX.1 [dev] Inpainting with LoRAs is a text-to-image model that supports inpainting and LoRA adaptations,
    enabling rapid and high-quality image inpainting using pre-trained LoRA weights for personalization,
    specific styles, brand identities, and product-specific outputs.
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to inpaint')
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The mask indicating areas to inpaint (white=inpaint, black=keep)')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='The CFG scale to determine how closely the model follows the prompt')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.85, description='The strength to use for inpainting. 1.0 completely remakes the image while 0.0 preserves the original')
    loras: List | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of LoRA weights to use for image generation')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxLoraInpainting"


import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image

class FluxLoraTTI(GraphNode):
    """
    FLUX.1 with LoRAs is a text-to-image model that supports LoRA adaptations,
    enabling high-quality image generation with customizable LoRA weights for
    personalization, specific styles, and brand identities.
    """

    LoraModel: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxLoraTTI.LoraModel
    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxLoraTTI.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    model_name: nodetool.nodes.fal.text_to_image.FluxLoraTTI.LoraModel = Field(default=LoraModel.SDXL_BASE, description='The base model to use for generation')
    image_size: nodetool.nodes.fal.text_to_image.FluxLoraTTI.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='How closely the model should stick to your prompt')
    loras: List | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of LoRA weights to use for image generation')
    prompt_weighting: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, prompt weighting syntax will be used and 77 token limit lifted')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxLoraTTI"


import nodetool.nodes.fal.text_to_image

class FluxSchnell(GraphNode):
    """
    FLUX.1 [schnell] is a 12 billion parameter flow transformer that generates high-quality images
    from text in 1 to 4 steps, suitable for personal and commercial use.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxSchnell.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxSchnell.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='Either a preset size or a custom {width, height} dictionary')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='The number of inference steps to perform')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxSchnell"


import nodetool.nodes.fal.text_to_image

class FluxSubject(GraphNode):
    """
    FLUX.1 Subject is a super fast endpoint for the FLUX.1 [schnell] model with subject input capabilities, enabling rapid and high-quality image generation for personalization, specific styles, brand identities, and product-specific outputs.
    image, generation, subject-driven, personalization, fast, text-to-image, txt2img

    Use cases:
    - Create variations of existing subjects
    - Generate personalized product images
    - Design brand-specific visuals
    - Produce custom character artwork
    - Create subject-based illustrations
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxSubject.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image of the subject')
    image_size: nodetool.nodes.fal.text_to_image.FluxSubject.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='Either a preset size or a custom {width, height} dictionary')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='The CFG scale to determine how closely the model follows the prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxSubject"


import nodetool.nodes.fal.text_to_image

class FluxV1Pro(GraphNode):
    """
    FLUX1.1 [pro] is an enhanced version of FLUX.1 [pro], improved image generation capabilities, delivering superior composition, detail, and artistic fidelity compared to its predecessor.
    image, generation, composition, detail, artistic, text-to-image, txt2img

    Use cases:
    - Generate high-fidelity artwork
    - Create detailed illustrations
    - Design complex compositions
    - Produce artistic renderings
    - Generate professional visuals
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxV1Pro.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxV1Pro.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='Either a preset size or a custom {width, height} dictionary. Max dimension 14142')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform.')
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The same seed and the same prompt given to the same version of the model will output the same image every time.')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxV1Pro"


import nodetool.nodes.fal.text_to_image

class FluxV1ProNew(GraphNode):
    """
    FLUX.1 [pro] new is an accelerated version of FLUX.1 [pro], maintaining professional-grade
    image quality while delivering significantly faster generation speeds.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxV1ProNew.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxV1ProNew.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='Either a preset size or a custom {width, height} dictionary')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='The CFG scale to determine how closely the model follows the prompt')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    safety_tolerance: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Safety tolerance level (1=strict, 6=permissive)')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxV1ProNew"


import nodetool.nodes.fal.text_to_image

class FluxV1ProUltra(GraphNode):
    """
    FLUX1.1 [ultra] is the latest and most advanced version of FLUX.1 [pro],
    featuring cutting-edge improvements in image generation, delivering unparalleled
    composition, detail, and artistic fidelity.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxV1ProUltra.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxV1ProUltra.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='Either a preset size or a custom {width, height} dictionary. Max dimension 14142')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt when looking for a related image to show you.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and the same prompt given to the same version of the model will output the same image every time.')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.FluxV1ProUltra"


import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image

class Fooocus(GraphNode):
    """
    Fooocus is a text-to-image model with default parameters and automated optimizations
    for quality improvements.
    """

    PerformanceEnum: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.Fooocus.PerformanceEnum
    RefinerModelEnum: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.Fooocus.RefinerModelEnum
    ControlTypeEnum: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.Fooocus.ControlTypeEnum
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    styles: List | GraphNode | tuple[GraphNode, str] = Field(default=['Fooocus Enhance', 'Fooocus V2', 'Fooocus Sharp'], description='The styles to apply to the generated image')
    performance: nodetool.nodes.fal.text_to_image.Fooocus.PerformanceEnum = Field(default=PerformanceEnum.EXTREME_SPEED, description='You can choose Speed or Quality')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=4.0, description='How closely the model should stick to your prompt')
    sharpness: float | GraphNode | tuple[GraphNode, str] = Field(default=2.0, description='Higher value means image and texture are sharper')
    aspect_ratio: str | GraphNode | tuple[GraphNode, str] = Field(default='1024x1024', description='The size of the generated image (must be multiples of 8)')
    loras: List | GraphNode | tuple[GraphNode, str] = Field(default=[], description='Up to 5 LoRAs that will be merged for generation')
    refiner_model: nodetool.nodes.fal.text_to_image.Fooocus.RefinerModelEnum = Field(default=RefinerModelEnum.NONE, description='Refiner model to use (SDXL or SD 1.5)')
    refiner_switch: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Switch point for refiner (0.4 for SD1.5 realistic, 0.667 for SD1.5 anime, 0.8 for XL)')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Reference image for generation')
    control_type: nodetool.nodes.fal.text_to_image.Fooocus.ControlTypeEnum = Field(default=ControlTypeEnum.PYRA_CANNY, description='The type of image control')
    control_image_weight: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength of the control image influence')
    control_image_stop_at: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='When to stop applying control image influence')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If false, the safety checker will be disabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.Fooocus"


import nodetool.nodes.fal.text_to_image

class HyperSDXL(GraphNode):
    """
    Hyper SDXL is a hyper-charged version of SDXL that delivers exceptional performance and creativity
    while maintaining high-quality output and ultra-fast generation speeds.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.HyperSDXL.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.HyperSDXL.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of inference steps to perform (1, 2, or 4)')
    sync_mode: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, wait for image generation and upload before returning')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')
    expand_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='If true, the prompt will be expanded with additional prompts')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.HyperSDXL"


import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image

class IdeogramV2(GraphNode):
    """
    Ideogram V2 is a state-of-the-art image generation model optimized for commercial and creative use, featuring exceptional typography handling and realistic outputs.
    image, generation, ai, typography, realistic, text-to-image, txt2img

    Use cases:
    - Create commercial artwork and designs
    - Generate realistic product visualizations
    - Design marketing materials with text
    - Produce high-quality illustrations
    - Create brand assets and logos
    """

    AspectRatio: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.IdeogramV2.AspectRatio
    IdeogramStyle: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.IdeogramV2.IdeogramStyle
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    aspect_ratio: nodetool.nodes.fal.text_to_image.IdeogramV2.AspectRatio = Field(default=AspectRatio.RATIO_1_1, description='The aspect ratio of the generated image.')
    expand_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to expand the prompt with MagicPrompt functionality.')
    style: nodetool.nodes.fal.text_to_image.IdeogramV2.IdeogramStyle = Field(default=IdeogramStyle.AUTO, description='The style of the generated image.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='A negative prompt to avoid in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator.')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.IdeogramV2"


import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image

class IdeogramV2Turbo(GraphNode):
    """
    Accelerated image generation with Ideogram V2 Turbo. Create high-quality visuals, posters,
    and logos with enhanced speed while maintaining Ideogram's signature quality.
    """

    AspectRatio: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.IdeogramV2Turbo.AspectRatio
    IdeogramStyle: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.IdeogramV2Turbo.IdeogramStyle
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    aspect_ratio: nodetool.nodes.fal.text_to_image.IdeogramV2Turbo.AspectRatio = Field(default=AspectRatio.RATIO_1_1, description='The aspect ratio of the generated image.')
    expand_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to expand the prompt with MagicPrompt functionality.')
    style: nodetool.nodes.fal.text_to_image.IdeogramV2Turbo.IdeogramStyle = Field(default=IdeogramStyle.AUTO, description='The style of the generated image.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='A negative prompt to avoid in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator.')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.IdeogramV2Turbo"


import nodetool.nodes.fal.text_to_image

class IllusionDiffusion(GraphNode):
    """
    Illusion Diffusion is a model that creates illusions conditioned on an input image.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.IllusionDiffusion.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image URL for conditioning the generation')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='How closely the model should stick to your prompt')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='The number of inference steps to perform')
    image_size: nodetool.nodes.fal.text_to_image.IllusionDiffusion.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.IllusionDiffusion"


import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image

class LCMDiffusion(GraphNode):
    """
    Latent Consistency Models (SDXL & SDv1.5) Text to Image produces high-quality images
    with minimal inference steps.
    """

    ModelNameLCM: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.LCMDiffusion.ModelNameLCM
    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.LCMDiffusion.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    model: nodetool.nodes.fal.text_to_image.LCMDiffusion.ModelNameLCM = Field(default=ModelNameLCM.SD_1_5, description='The model to use for generating the image')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    image_size: nodetool.nodes.fal.text_to_image.LCMDiffusion.ImageSizePreset = Field(default=ImageSizePreset.SQUARE, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='How closely the model should stick to your prompt')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.LCMDiffusion"


import nodetool.nodes.fal.text_to_image

class LumaPhoton(GraphNode):
    """
    Luma Photon is a creative and personalizable text-to-image model that brings a step-function
    change in the cost of high-quality image generation, optimized for creatives.
    """

    AspectRatioLuma: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.LumaPhoton.AspectRatioLuma
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    aspect_ratio: nodetool.nodes.fal.text_to_image.LumaPhoton.AspectRatioLuma = Field(default=AspectRatioLuma.RATIO_1_1, description='The aspect ratio of the generated image')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.LumaPhoton"


import nodetool.nodes.fal.text_to_image

class LumaPhotonFlash(GraphNode):
    """
    Luma Photon Flash is the most creative, personalizable, and intelligent visual model for creatives,
    bringing a step-function change in the cost of high-quality image generation with faster inference times.
    """

    AspectRatioLuma: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.LumaPhotonFlash.AspectRatioLuma
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    aspect_ratio: nodetool.nodes.fal.text_to_image.LumaPhotonFlash.AspectRatioLuma = Field(default=AspectRatioLuma.RATIO_1_1, description='The aspect ratio of the generated image')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.LumaPhotonFlash"


import nodetool.nodes.fal.text_to_image

class OmniGenV1(GraphNode):
    """
    OmniGen is a unified image generation model that can generate a wide range of images from multi-modal prompts. It can be used for various tasks such as Image Editing, Personalized Image Generation, Virtual Try-On, Multi Person Generation and more!
    image, generation, multi-modal, editing, personalization, text-to-image, txt2img

    Use cases:
    - Edit and modify existing images
    - Create personalized visual content
    - Generate virtual try-on images
    - Create multi-person compositions
    - Combine multiple images creatively
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.OmniGenV1.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    input_image_1: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The first input image to use for generation')
    input_image_2: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The second input image to use for generation')
    image_size: nodetool.nodes.fal.text_to_image.OmniGenV1.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.0, description='How closely the model should stick to your prompt')
    img_guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.6, description='How closely the model should stick to your input image')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.OmniGenV1"


import nodetool.nodes.fal.text_to_image

class PlaygroundV25(GraphNode):
    """
    Playground v2.5 is a state-of-the-art open-source model that excels in aesthetic quality
    for text-to-image generation.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.PlaygroundV25.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.PlaygroundV25.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='How closely the model should stick to your prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.PlaygroundV25"


import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image

class Recraft20B(GraphNode):
    """
    Recraft 20B is a new and affordable text-to-image model that delivers state-of-the-art results.
     image, generation, efficient, text-to-image, txt2img

    Use cases:
    - Generate cost-effective visuals
    - Create high-quality images
    - Produce professional artwork
    - Design marketing materials
    - Generate commercial content
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.Recraft20B.ImageSizePreset
    StylePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.Recraft20B.StylePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.Recraft20B.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='Either a preset size or a custom {width, height} dictionary')
    style: nodetool.nodes.fal.text_to_image.Recraft20B.StylePreset = Field(default=StylePreset.REALISTIC_IMAGE, description='The style of the generated images. Vector images cost 2X as much.')
    colors: List | GraphNode | tuple[GraphNode, str] = Field(default=[], description='An array of preferable colors')
    style_id: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The ID of the custom style reference (optional)')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.Recraft20B"


import nodetool.nodes.fal.text_to_image
import nodetool.nodes.fal.text_to_image

class RecraftV3(GraphNode):
    """
    Recraft V3 is a text-to-image model with the ability to generate long texts, vector art, images in brand style, and much more.
    image, text
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.RecraftV3.ImageSizePreset
    StylePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.RecraftV3.StylePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.RecraftV3.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='Either a preset size or a custom {width, height} dictionary. Max dimension 14142')
    style: nodetool.nodes.fal.text_to_image.RecraftV3.StylePreset = Field(default=StylePreset.REALISTIC_IMAGE, description='The style of the generated images. Vector images cost 2X as much.')
    colors: List | GraphNode | tuple[GraphNode, str] = Field(default=[], description='An array of preferable colors')
    style_id: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The ID of the custom style reference (optional)')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.RecraftV3"


import nodetool.nodes.fal.text_to_image

class SanaV1(GraphNode):
    """
    Sana can synthesize high-resolution, high-quality images with strong text-image alignment at a remarkably fast speed, with the ability to generate 4K images in less than a second.
    image, generation, high-resolution, fast, text-alignment, text-to-image, txt2img

    Use cases:
    - Generate 4K quality images
    - Create high-resolution artwork
    - Produce rapid visual prototypes
    - Design detailed illustrations
    - Generate precise text-aligned visuals
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.SanaV1.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    image_size: nodetool.nodes.fal.text_to_image.SanaV1.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=18, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='How closely the model should stick to your prompt')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.SanaV1"


import nodetool.nodes.fal.text_to_image

class StableCascade(GraphNode):
    """
    Stable Cascade is a state-of-the-art text-to-image model that generates images on a smaller & cheaper
    latent space while maintaining high quality output.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.StableCascade.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    first_stage_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description='Number of steps to run the first stage for')
    second_stage_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of steps to run the second stage for')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=4.0, description='How closely the model should stick to your prompt')
    second_stage_guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=4.0, description='Guidance scale for the second stage of generation')
    image_size: nodetool.nodes.fal.text_to_image.StableCascade.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.StableCascade"


import nodetool.nodes.fal.text_to_image

class StableDiffusionV35Large(GraphNode):
    """
    Stable Diffusion 3.5 Large is a Multimodal Diffusion Transformer (MMDiT) text-to-image model that features
    improved performance in image quality, typography, complex prompt understanding, and resource-efficiency.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.StableDiffusionV35Large.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='How closely the model should stick to your prompt')
    image_size: nodetool.nodes.fal.text_to_image.StableDiffusionV35Large.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='The size of the generated image')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.StableDiffusionV35Large"


import nodetool.nodes.fal.text_to_image

class StableDiffusionV3Medium(GraphNode):
    """
    Stable Diffusion 3 Medium (Text to Image) is a Multimodal Diffusion Transformer (MMDiT) model
    that improves image quality, typography, prompt understanding, and efficiency.
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.StableDiffusionV3Medium.ImageSizePreset
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to generate an image from')
    prompt_expansion: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='If set to true, prompt will be upsampled with more details')
    image_size: nodetool.nodes.fal.text_to_image.StableDiffusionV3Medium.ImageSizePreset = Field(default=ImageSizePreset.SQUARE_HD, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='How closely the model should stick to your prompt (CFG scale)')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of images to generate')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.StableDiffusionV3Medium"



class Switti(GraphNode):
    """
    Switti is a scale-wise transformer for fast text-to-image generation that outperforms existing T2I AR models and competes with state-of-the-art T2I diffusion models while being faster than distilled diffusion models.
    image, generation, fast, transformer, efficient, text-to-image, txt2img

    Use cases:
    - Rapid image prototyping
    - Real-time image generation
    - Quick visual concept testing
    - Fast artistic visualization
    - Efficient batch image creation
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Use it to address details that you don't want in the image")
    sampling_top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=400, description='The number of top-k tokens to sample from')
    sampling_top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The top-p probability to sample from')
    more_smooth: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Smoothing with Gumbel softmax sampling')
    more_diverse: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='More diverse sampling')
    smooth_start_si: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Smoothing starting scale')
    turn_off_cfg_start_si: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Disable CFG starting scale')
    last_scale_temp: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Temperature after disabling CFG')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed and prompt will output the same image every time')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=6.0, description='How closely the model should stick to your prompt')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.text_to_image.Switti"


