from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Kandinsky3Img2Img(GraphNode):
    """
    Transforms existing images using the Kandinsky-3 model based on text prompts.
    image, generation, image-to-image

    Use cases:
    - Modify existing images based on text descriptions
    - Apply specific styles or concepts to photographs or artwork
    - Create variations of existing visual content
    - Blend AI-generated elements with existing images
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.', description='A text prompt describing the desired image transformation.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='The number of denoising steps.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The strength of the transformation. Use a value between 0.0 and 1.0.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to transform')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Seed for the random number generator. Use -1 for a random seed.')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.Kandinsky3Img2Img"



class RealESRGANNode(GraphNode):
    """
    Performs image super-resolution using the RealESRGAN model.
    image, super-resolution, enhancement, huggingface

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Upscale images for better detail
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to transform')
    model: HFRealESRGAN | GraphNode | tuple[GraphNode, str] = Field(default=HFRealESRGAN(type='hf.real_esrgan', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The RealESRGAN model to use for image super-resolution')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.RealESRGAN"


import nodetool.nodes.huggingface.stable_diffusion_base
import nodetool.nodes.huggingface.stable_diffusion_base

class StableDiffusionControlNetImg2ImgNode(GraphNode):
    """
    Transforms existing images using Stable Diffusion with ControlNet guidance.
    image, generation, image-to-image, controlnet, SD

    Use cases:
    - Modify existing images with precise control over composition and structure
    - Apply specific styles or concepts to photographs or artwork with guided transformations
    - Create variations of existing visual content while maintaining certain features
    - Enhance image editing capabilities with AI-guided transformations
    """

    model: HFStableDiffusion | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusion(type='hf.stable_diffusion', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use for image generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(blurry, low quality, deformed, mutated, bad anatomy, extra limbs, bad proportions, text, watermark, grainy, pixelated, disfigured face, missing fingers, cropped image, bad lighting', description='The negative prompt to guide what should not appear in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator. Use -1 for a random seed.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance scale for generation.')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetImg2ImgNode.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetImg2ImgNode.StableDiffusionScheduler('EulerDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    loras: list[HFLoraSDConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The LoRA models to use for image processing')
    ip_adapter_model: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IP adapter model to use for image processing')
    ip_adapter_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided the image will be fed into the IP adapter')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The strength of the IP adapter')
    detail_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail.')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling for the VAE. This can reduce VRAM usage.')
    enable_cpu_offload: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable CPU offload for the pipeline. This can reduce VRAM usage.')
    upscaler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetImg2ImgNode.StableDiffusionUpscaler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetImg2ImgNode.StableDiffusionUpscaler('None'), description='The upscaler to use for 2-pass generation.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to be transformed.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Similarity to the input image')
    controlnet: HFControlNet | GraphNode | tuple[GraphNode, str] = Field(default=HFControlNet(type='hf.controlnet', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The ControlNet model to use for guidance.')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The control image to guide the transformation.')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.StableDiffusionControlNetImg2Img"


import nodetool.nodes.huggingface.stable_diffusion_base
import nodetool.nodes.huggingface.stable_diffusion_base
import nodetool.nodes.huggingface.image_to_image

class StableDiffusionControlNetInpaintNode(GraphNode):
    """
    Performs inpainting on images using Stable Diffusion with ControlNet guidance.
    image, inpainting, controlnet, SD

    Use cases:
    - Remove unwanted objects from images with precise control
    - Fill in missing parts of images guided by control images
    - Modify specific areas of images while preserving the rest and maintaining structure
    """

    model: HFStableDiffusion | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusion(type='hf.stable_diffusion', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use for image generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(blurry, low quality, deformed, mutated, bad anatomy, extra limbs, bad proportions, text, watermark, grainy, pixelated, disfigured face, missing fingers, cropped image, bad lighting', description='The negative prompt to guide what should not appear in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator. Use -1 for a random seed.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance scale for generation.')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetInpaintNode.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetInpaintNode.StableDiffusionScheduler('EulerDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    loras: list[HFLoraSDConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The LoRA models to use for image processing')
    ip_adapter_model: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IP adapter model to use for image processing')
    ip_adapter_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided the image will be fed into the IP adapter')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The strength of the IP adapter')
    detail_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail.')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling for the VAE. This can reduce VRAM usage.')
    enable_cpu_offload: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable CPU offload for the pipeline. This can reduce VRAM usage.')
    upscaler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetInpaintNode.StableDiffusionUpscaler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetInpaintNode.StableDiffusionUpscaler('None'), description='The upscaler to use for 2-pass generation.')
    controlnet: nodetool.nodes.huggingface.image_to_image.StableDiffusionControlNetInpaintNode.StableDiffusionControlNetModel = Field(default=nodetool.nodes.huggingface.image_to_image.StableDiffusionControlNetInpaintNode.StableDiffusionControlNetModel('lllyasviel/control_v11p_sd15_inpaint'), description='The ControlNet model to use for guidance.')
    init_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The initial image to be inpainted.')
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The mask image indicating areas to be inpainted.')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The control image to guide the inpainting process.')
    controlnet_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The scale for ControlNet conditioning.')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.StableDiffusionControlNetInpaint"


import nodetool.nodes.huggingface.stable_diffusion_base
import nodetool.nodes.huggingface.stable_diffusion_base

class StableDiffusionControlNetNode(GraphNode):
    """
    Generates images using Stable Diffusion with ControlNet guidance.
    image, generation, text-to-image, controlnet, SD

    Use cases:
    - Generate images with precise control over composition and structure
    - Create variations of existing images while maintaining specific features
    - Artistic image generation with guided outputs
    """

    model: HFStableDiffusion | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusion(type='hf.stable_diffusion', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use for image generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(blurry, low quality, deformed, mutated, bad anatomy, extra limbs, bad proportions, text, watermark, grainy, pixelated, disfigured face, missing fingers, cropped image, bad lighting', description='The negative prompt to guide what should not appear in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator. Use -1 for a random seed.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance scale for generation.')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetNode.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetNode.StableDiffusionScheduler('EulerDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    loras: list[HFLoraSDConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The LoRA models to use for image processing')
    ip_adapter_model: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IP adapter model to use for image processing')
    ip_adapter_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided the image will be fed into the IP adapter')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The strength of the IP adapter')
    detail_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail.')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling for the VAE. This can reduce VRAM usage.')
    enable_cpu_offload: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable CPU offload for the pipeline. This can reduce VRAM usage.')
    upscaler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetNode.StableDiffusionUpscaler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionControlNetNode.StableDiffusionUpscaler('None'), description='The upscaler to use for 2-pass generation.')
    controlnet: HFControlNet | GraphNode | tuple[GraphNode, str] = Field(default=HFControlNet(type='hf.controlnet', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The ControlNet model to use for guidance.')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The control image to guide the generation process.')
    controlnet_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The scale for ControlNet conditioning.')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.StableDiffusionControlNet"


import nodetool.nodes.huggingface.stable_diffusion_base
import nodetool.nodes.huggingface.stable_diffusion_base

class StableDiffusionImg2ImgNode(GraphNode):
    """
    Transforms existing images based on text prompts using Stable Diffusion.
    image, generation, image-to-image, SD, img2img

    Use cases:
    - Modifying existing images to fit a specific style or theme
    - Enhancing or altering photographs
    - Creating variations of existing artwork
    - Applying text-guided edits to images
    """

    model: HFStableDiffusion | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusion(type='hf.stable_diffusion', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use for image generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(blurry, low quality, deformed, mutated, bad anatomy, extra limbs, bad proportions, text, watermark, grainy, pixelated, disfigured face, missing fingers, cropped image, bad lighting', description='The negative prompt to guide what should not appear in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator. Use -1 for a random seed.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance scale for generation.')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionImg2ImgNode.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionImg2ImgNode.StableDiffusionScheduler('EulerDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    loras: list[HFLoraSDConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The LoRA models to use for image processing')
    ip_adapter_model: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IP adapter model to use for image processing')
    ip_adapter_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided the image will be fed into the IP adapter')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The strength of the IP adapter')
    detail_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail.')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling for the VAE. This can reduce VRAM usage.')
    enable_cpu_offload: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable CPU offload for the pipeline. This can reduce VRAM usage.')
    upscaler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionImg2ImgNode.StableDiffusionUpscaler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionImg2ImgNode.StableDiffusionUpscaler('None'), description='The upscaler to use for 2-pass generation.')
    init_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The initial image for Image-to-Image generation.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Strength for Image-to-Image generation. Higher values allow for more deviation from the original image.')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.StableDiffusionImg2Img"


import nodetool.nodes.huggingface.stable_diffusion_base
import nodetool.nodes.huggingface.stable_diffusion_base

class StableDiffusionInpaintNode(GraphNode):
    """
    Performs inpainting on images using Stable Diffusion.
    image, inpainting, AI, SD

    Use cases:
    - Remove unwanted objects from images
    - Fill in missing parts of images
    - Modify specific areas of images while preserving the rest
    """

    model: HFStableDiffusion | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusion(type='hf.stable_diffusion', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model to use for image generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='(blurry, low quality, deformed, mutated, bad anatomy, extra limbs, bad proportions, text, watermark, grainy, pixelated, disfigured face, missing fingers, cropped image, bad lighting', description='The negative prompt to guide what should not appear in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator. Use -1 for a random seed.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of denoising steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance scale for generation.')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionInpaintNode.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionInpaintNode.StableDiffusionScheduler('EulerDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    loras: list[HFLoraSDConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The LoRA models to use for image processing')
    ip_adapter_model: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IP adapter model to use for image processing')
    ip_adapter_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided the image will be fed into the IP adapter')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='The strength of the IP adapter')
    detail_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Level of detail for the hi-res pass. 0.0 is low detail, 1.0 is high detail.')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling for the VAE. This can reduce VRAM usage.')
    enable_cpu_offload: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable CPU offload for the pipeline. This can reduce VRAM usage.')
    upscaler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionInpaintNode.StableDiffusionUpscaler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionInpaintNode.StableDiffusionUpscaler('None'), description='The upscaler to use for 2-pass generation.')
    init_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The initial image to be inpainted.')
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The mask image indicating areas to be inpainted.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Strength for inpainting. Higher values allow for more deviation from the original image.')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.StableDiffusionInpaint"


import nodetool.nodes.huggingface.stable_diffusion_base

class StableDiffusionUpscale(GraphNode):
    """
    Upscales an image using Stable Diffusion 4x upscaler.
    image, upscaling, stable-diffusion, SD

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Create high-resolution versions of small images
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to guide what should not appear in the generated image.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of upscaling steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.5, description='Guidance scale for generation.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The initial image for Image-to-Image generation.')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionUpscale.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionUpscale.StableDiffusionScheduler('HeunDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator. Use -1 for a random seed.')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling to save VRAM')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.StableDiffusionUpscale"


import nodetool.nodes.huggingface.stable_diffusion_base

class StableDiffusionXLControlNetNode(GraphNode):
    """
    Transforms existing images using Stable Diffusion XL with ControlNet guidance.
    image, generation, image-to-image, controlnet, SDXL

    Use cases:
    - Modify existing images with precise control over composition and structure
    - Apply specific styles or concepts to photographs or artwork with guided transformations
    - Create variations of existing visual content while maintaining certain features
    - Enhance image editing capabilities with AI-guided transformations
    """

    model: HFStableDiffusionXL | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusionXL(type='hf.stable_diffusion_xl', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The Stable Diffusion XL model to use for generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to guide what should not appear in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of inference steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description='Guidance scale for generation.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of the generated image.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of the generated image')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionXLControlNetNode.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionXLControlNetNode.StableDiffusionScheduler('EulerDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    loras: list[HFLoraSDXLConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The LoRA models to use for image processing')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Strength of the LoRAs')
    ip_adapter_model: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IP adapter model to use for image processing')
    ip_adapter_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided the image will be fed into the IP adapter')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Strength of the IP adapter image')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling for the VAE. This can reduce VRAM usage.')
    enable_cpu_offload: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable CPU offload for the pipeline. This can reduce VRAM usage.')
    init_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The initial image for Image-to-Image generation.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Strength for Image-to-Image generation. Higher values allow for more deviation from the original image.')
    controlnet: HFControlNet | GraphNode | tuple[GraphNode, str] = Field(default=HFControlNet(type='hf.controlnet', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The ControlNet model to use for guidance.')
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The control image to guide the transformation.')
    controlnet_conditioning_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The scale for ControlNet conditioning.')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.StableDiffusionXLControlNet"


import nodetool.nodes.huggingface.stable_diffusion_base

class StableDiffusionXLImg2Img(GraphNode):
    """
    Transforms existing images based on text prompts using Stable Diffusion XL.
    image, generation, image-to-image, SDXL

    Use cases:
    - Modifying existing images to fit a specific style or theme
    - Enhancing or altering photographs
    - Creating variations of existing artwork
    - Applying text-guided edits to images
    """

    model: HFStableDiffusionXL | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusionXL(type='hf.stable_diffusion_xl', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The Stable Diffusion XL model to use for generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to guide what should not appear in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of inference steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description='Guidance scale for generation.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of the generated image.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of the generated image')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionXLImg2Img.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionXLImg2Img.StableDiffusionScheduler('EulerDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    loras: list[HFLoraSDXLConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The LoRA models to use for image processing')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Strength of the LoRAs')
    ip_adapter_model: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IP adapter model to use for image processing')
    ip_adapter_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided the image will be fed into the IP adapter')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Strength of the IP adapter image')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling for the VAE. This can reduce VRAM usage.')
    enable_cpu_offload: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable CPU offload for the pipeline. This can reduce VRAM usage.')
    init_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The initial image for Image-to-Image generation.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Strength for Image-to-Image generation. Higher values allow for more deviation from the original image.')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.StableDiffusionXLImg2Img"


import nodetool.nodes.huggingface.stable_diffusion_base

class StableDiffusionXLInpainting(GraphNode):
    """
    Performs inpainting on images using Stable Diffusion XL.
    image, inpainting, SDXL

    Use cases:
    - Remove unwanted objects from images
    - Fill in missing parts of images
    - Modify specific areas of images while preserving the rest
    """

    model: HFStableDiffusionXL | GraphNode | tuple[GraphNode, str] = Field(default=HFStableDiffusionXL(type='hf.stable_diffusion_xl', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The Stable Diffusion XL model to use for generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt for image generation.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to guide what should not appear in the generated image.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for the random number generator.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of inference steps.')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description='Guidance scale for generation.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Width of the generated image.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Height of the generated image')
    scheduler: nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionXLInpainting.StableDiffusionScheduler = Field(default=nodetool.nodes.huggingface.stable_diffusion_base.StableDiffusionXLInpainting.StableDiffusionScheduler('EulerDiscreteScheduler'), description='The scheduler to use for the diffusion process.')
    loras: list[HFLoraSDXLConfig] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The LoRA models to use for image processing')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Strength of the LoRAs')
    ip_adapter_model: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IP adapter model to use for image processing')
    ip_adapter_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='When provided the image will be fed into the IP adapter')
    ip_adapter_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Strength of the IP adapter image')
    enable_tiling: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable tiling for the VAE. This can reduce VRAM usage.')
    enable_cpu_offload: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Enable CPU offload for the pipeline. This can reduce VRAM usage.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The initial image to be inpainted.')
    mask_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The mask image indicating areas to be inpainted.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Strength for inpainting. Higher values allow for more deviation from the original image.')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.StableDiffusionXLInpainting"



class Swin2SR(GraphNode):
    """
    Performs image super-resolution using the Swin2SR model.
    image, super-resolution, enhancement, huggingface

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Upscale images for better detail
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to transform')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text prompt to guide the image transformation (if applicable)')
    model: HFImageToImage | GraphNode | tuple[GraphNode, str] = Field(default=HFImageToImage(type='hf.image_to_image', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for image super-resolution')

    @classmethod
    def get_node_type(cls): return "huggingface.image_to_image.Swin2SR"


