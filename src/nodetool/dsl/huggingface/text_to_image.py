from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.huggingface.stable_diffusion_base
import nodetool.nodes.huggingface.stable_diffusion_base

class StableDiffusion(GraphNode):
    """
    Generates images from text prompts using Stable Diffusion.
    image, generation, AI, text-to-image, SD

    Use cases:
    - Creating custom illustrations for various projects
    - Generating concept art for creative endeavors
    - Producing unique visual content for marketing materials
    - Exploring AI-generated art for personal or professional use
    """

    model: HFStableDiffusion | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusion(type='hf.stable_diffusion', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use for image generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(blurry, low quality, deformed, mutated, bad anatomy, extra limbs, bad proportions, text, watermark, grainy, pixelated, disfigured face, missing fingers, cropped image, bad lighting', description='The negative prompt to guide what should not appear in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator. Use -1 for a random seed.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance scale for generation.')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusion.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusion.StableDiffusionScheduler('EulerDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    loras: list[HFLoraSDConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The LoRA models to use for image processing')
    ip_adapter_model: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IP adapter model to use for image processing')
    ip_adapter_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided the image will be fed into the IP adapter')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The strength of the IP adapter')
    detail_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail.')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling for the VAE. This can reduce VRAM usage.')
    enable_cpu_offload: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable CPU offload for the pipeline. This can reduce VRAM usage.')
    upscaler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusion.StableDiffusionUpscaler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusion.StableDiffusionUpscaler('None'), description='The upscaler to use for 2-pass generation.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width of the generated image.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of the generated image')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_image.StableDiffusion"


import nodetool.nodes.huggingface.stable_diffusion_base

class StableDiffusionXL(GraphNode):
    """
    Generates images from text prompts using Stable Diffusion XL.
    image, generation, AI, text-to-image, SDXL

    Use cases:
    - Creating custom illustrations for marketing materials
    - Generating concept art for game and film development
    - Producing unique stock imagery for websites and publications
    - Visualizing interior design concepts for clients
    """

    model: HFStableDiffusionXL | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusionXL(type='hf.stable_diffusion_xl', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The Stable Diffusion XL model to use for generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to guide what should not appear in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of inference steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description='Guidance scale for generation.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of the generated image.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of the generated image')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionXL.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionXL.StableDiffusionScheduler('EulerDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    loras: list[HFLoraSDXLConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The LoRA models to use for image processing')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Strength of the LoRAs')
    ip_adapter_model: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IP adapter model to use for image processing')
    ip_adapter_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided the image will be fed into the IP adapter')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Strength of the IP adapter image')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling for the VAE. This can reduce VRAM usage.')
    enable_cpu_offload: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable CPU offload for the pipeline. This can reduce VRAM usage.')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_image.StableDiffusionXL"


