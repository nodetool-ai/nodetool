from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.comfy.enums
import nodetool.nodes.comfy.enums

class ControlNet(GraphNode):
    """
    Generates images using Stable Diffusion with ControlNet for additional image control. Supports optional high-resolution upscaling while maintaining the same ControlNet strength.
    image, controlnet, generative, stable diffusion, high-resolution, SD

    Use cases:
    - Generating images with specific structural guidance
    - Creating images that follow edge maps or depth information
    - Producing variations of images while maintaining certain features
    - Enhancing image generation with additional control signals
    - Creating high-resolution images with consistent controlled features
    """

    model: HFStableDiffusion | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusion(type='hf.stable_diffusion', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description=None)
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description=None)
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    scheduler: nodetool.nodes.comfy.enums.ControlNet.Scheduler = Field(default=nodetool.nodes.comfy.enums.ControlNet.Scheduler('exponential'), description=None)
    sampler: nodetool.nodes.comfy.enums.ControlNet.Sampler = Field(default=nodetool.nodes.comfy.enums.ControlNet.Sampler('euler_ancestral'), description=None)
    input_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img (optional)')
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Mask image for img2img (optional)')
    grow_mask_by: int | GraphNode | tuple[GraphNode, str] = Field(default=6, description=None)
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    loras: list[LoRAConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of LoRA models to apply')
    controlnet: HFControlNet | GraphNode | tuple[GraphNode, str] = Field(default=HFControlNet(type='hf.controlnet', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The ControlNet model to use.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Canny edge detection image for ControlNet')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength of ControlNet (used for both low and high resolution)')

    @classmethod
    def get_node_type(cls): return "comfy.basic.ControlNet"


import nodetool.nodes.comfy.enums
import nodetool.nodes.comfy.enums

class Flux(GraphNode):
    """
    Generates images from text prompts using the Flux model.
    image, text-to-image, generative AI, flux

    Use cases:
    - Creating high-quality anime-style illustrations
    - Generating detailed character artwork
    - Producing images with specific artistic styles
    """

    model: HFFlux | GraphNode | tuple[GraphNode, str] = Field(default=HFFlux(type='hf.flux', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description=None)
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description=None)
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description=None)
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    scheduler: nodetool.nodes.comfy.enums.Flux.Scheduler = Field(default=nodetool.nodes.comfy.enums.Flux.Scheduler('simple'), description=None)
    sampler: nodetool.nodes.comfy.enums.Flux.Sampler = Field(default=nodetool.nodes.comfy.enums.Flux.Sampler('euler'), description=None)

    @classmethod
    def get_node_type(cls): return "comfy.basic.Flux"


import nodetool.nodes.comfy.enums
import nodetool.nodes.comfy.enums

class FluxFP8(GraphNode):
    """
    Generates images from text prompts using the Flux model.
    image, text-to-image, generative AI, flux

    Use cases:
    - Creating high-quality anime-style illustrations
    - Generating detailed character artwork
    - Producing images with specific artistic styles
    """

    model: HFFlux | GraphNode | tuple[GraphNode, str] = Field(default=HFFlux(type='hf.flux', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description=None)
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description=None)
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description=None)
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    scheduler: nodetool.nodes.comfy.enums.FluxFP8.Scheduler = Field(default=nodetool.nodes.comfy.enums.FluxFP8.Scheduler('simple'), description=None)
    sampler: nodetool.nodes.comfy.enums.FluxFP8.Sampler = Field(default=nodetool.nodes.comfy.enums.FluxFP8.Sampler('euler'), description=None)

    @classmethod
    def get_node_type(cls): return "comfy.basic.FluxFP8"



class LoRASelector(GraphNode):
    """
    Selects up to 5 LoRA models to apply to a Stable Diffusion model.
    lora, model customization, fine-tuning

    Use cases:
    - Combining multiple LoRA models for unique image styles
    - Fine-tuning Stable Diffusion models with specific attributes
    - Experimenting with different LoRA combinations
    """

    lora1: LORAFile | None | GraphNode | tuple[GraphNode, str] = Field(default=LORAFile(type='comfy.lora_file', name=''), description='First LoRA model')
    strength1: float | None | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for first LoRA')
    lora2: LORAFile | None | GraphNode | tuple[GraphNode, str] = Field(default=LORAFile(type='comfy.lora_file', name=''), description='Second LoRA model')
    strength2: float | None | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for second LoRA')
    lora3: LORAFile | None | GraphNode | tuple[GraphNode, str] = Field(default=LORAFile(type='comfy.lora_file', name=''), description='Third LoRA model')
    strength3: float | None | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for third LoRA')
    lora4: LORAFile | None | GraphNode | tuple[GraphNode, str] = Field(default=LORAFile(type='comfy.lora_file', name=''), description='Fourth LoRA model')
    strength4: float | None | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for fourth LoRA')
    lora5: LORAFile | None | GraphNode | tuple[GraphNode, str] = Field(default=LORAFile(type='comfy.lora_file', name=''), description='Fifth LoRA model')
    strength5: float | None | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for fifth LoRA')

    @classmethod
    def get_node_type(cls): return "comfy.basic.LoRASelector"


import nodetool.nodes.comfy.enums
import nodetool.nodes.comfy.enums

class StableDiffusion(GraphNode):
    """
    Generates images based on an input image and text prompts using Stable Diffusion. Works with 1.5 and XL models. Supports optional high-resolution upscaling.
    image, image-to-image, generative AI, stable diffusion, high-resolution, SD1.5

    Use cases:
    - Modifying existing images based on text descriptions
    - Applying artistic styles to photographs
    - Generating variations of existing artwork or designs
    - Enhancing or altering stock images for specific needs
    - Creating high-resolution images from lower resolution inputs
    """

    model: HFStableDiffusion | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusion(type='hf.stable_diffusion', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description=None)
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description=None)
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    scheduler: nodetool.nodes.comfy.enums.StableDiffusion.Scheduler = Field(default=nodetool.nodes.comfy.enums.StableDiffusion.Scheduler('exponential'), description=None)
    sampler: nodetool.nodes.comfy.enums.StableDiffusion.Sampler = Field(default=nodetool.nodes.comfy.enums.StableDiffusion.Sampler('euler_ancestral'), description=None)
    input_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img (optional)')
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Mask image for img2img (optional)')
    grow_mask_by: int | GraphNode | tuple[GraphNode, str] = Field(default=6, description=None)
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    loras: list[LoRAConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of LoRA models to apply')

    @classmethod
    def get_node_type(cls): return "comfy.basic.StableDiffusion"


import nodetool.nodes.comfy.enums
import nodetool.nodes.comfy.enums

class StableDiffusion3(GraphNode):
    """
    Generates images using Stable Diffusion 3.5 model.
    image, text-to-image, generative, SD3.5
    Generates images using Stable Diffusion 3 model.
    image, text-to-image, generative, SD3

    Use cases:
    - Creating high-quality images with the latest SD3 model
    - Generating detailed and coherent images from text descriptions
    - Producing images with improved composition and understanding
    """

    model: HFStableDiffusion3 | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusion3(type='hf.stable_diffusion_3', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=4.0, description=None)
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=20, description=None)
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    scheduler: nodetool.nodes.comfy.enums.StableDiffusion3.Scheduler = Field(default=nodetool.nodes.comfy.enums.StableDiffusion3.Scheduler('exponential'), description=None)
    sampler: nodetool.nodes.comfy.enums.StableDiffusion3.Sampler = Field(default=nodetool.nodes.comfy.enums.StableDiffusion3.Sampler('euler_ancestral'), description=None)
    input_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img (optional)')
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Mask image for img2img (optional)')
    grow_mask_by: int | GraphNode | tuple[GraphNode, str] = Field(default=6, description=None)
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    loras: list[LoRAConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of LoRA models to apply')

    @classmethod
    def get_node_type(cls): return "comfy.basic.StableDiffusion3"


import nodetool.nodes.comfy.enums
import nodetool.nodes.comfy.enums

class StableDiffusionXL(GraphNode):
    """
    Generates images using Stable Diffusion XL model.
    image, text-to-image, generative AI, SDXL

    Use cases:
    - Creating high-quality images with the latest SDXL models
    - Generating detailed and coherent images from text descriptions
    - Producing images with improved composition and understanding
    """

    model: HFStableDiffusionXL | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusionXL(type='hf.stable_diffusion_xl', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description=None)
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description=None)
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    scheduler: nodetool.nodes.comfy.enums.StableDiffusionXL.Scheduler = Field(default=nodetool.nodes.comfy.enums.StableDiffusionXL.Scheduler('exponential'), description=None)
    sampler: nodetool.nodes.comfy.enums.StableDiffusionXL.Sampler = Field(default=nodetool.nodes.comfy.enums.StableDiffusionXL.Sampler('euler_ancestral'), description=None)
    input_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image for img2img (optional)')
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Mask image for img2img (optional)')
    grow_mask_by: int | GraphNode | tuple[GraphNode, str] = Field(default=6, description=None)
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    loras: list[LoRAConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of LoRA models to apply')

    @classmethod
    def get_node_type(cls): return "comfy.basic.StableDiffusionXL"


