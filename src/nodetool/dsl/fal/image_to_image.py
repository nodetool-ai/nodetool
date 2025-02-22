from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class BriaBackgroundRemove(GraphNode):
    """
    Bria RMBG 2.0 enables seamless removal of backgrounds from images, ideal for professional editing tasks. 
    Trained exclusively on licensed data for safe and risk-free commercial use.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image to remove background from')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.BriaBackgroundRemove"



class BriaBackgroundReplace(GraphNode):
    """Bria Background Replace allows for efficient swapping of backgrounds in images via text prompts or reference image, delivering realistic and polished results. Trained exclusively on licensed data for safe and risk-free commercial use.
    image, background, replacement, swap

    Use cases:
    - Replace image backgrounds seamlessly
    - Create professional photo compositions
    - Generate custom scene settings
    - Produce commercial-ready images
    - Create consistent visual environments
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image to replace background')
    ref_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Reference image for the new background')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt to generate new background')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Negative prompt for background generation')
    refine_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to refine the prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.BriaBackgroundReplace"



class BriaEraser(GraphNode):
    """
    Bria Eraser enables precise removal of unwanted objects from images while maintaining high-quality outputs. Trained exclusively on licensed data for safe and risk-free commercial use.
    image, removal, cleanup

    Use cases:
    - Remove unwanted objects from images
    - Clean up image imperfections
    - Prepare images for commercial use
    - Remove distracting elements
    - Create clean, professional images
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image to erase from')
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The mask for areas to be cleaned')
    mask_type: str | GraphNode | tuple[GraphNode, str] = Field(default='manual', description="Type of mask - 'manual' for user-created or 'automatic' for algorithm-generated")

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.BriaEraser"



class BriaExpand(GraphNode):
    """Bria Expand expands images beyond their borders in high quality. Trained exclusively on licensed data for safe and risk-free commercial use.
    image, expansion, outpainting

    Use cases:
    - Extend image boundaries seamlessly
    - Create wider or taller compositions
    - Expand images for different aspect ratios
    - Generate additional scene content
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to expand')
    canvas_width: int | GraphNode | tuple[GraphNode, str] = Field(default=1200, description='The desired width of the final image, after the expansion')
    canvas_height: int | GraphNode | tuple[GraphNode, str] = Field(default=674, description='The desired height of the final image, after the expansion')
    original_image_width: int | GraphNode | tuple[GraphNode, str] = Field(default=610, description='The desired width of the original image, inside the full canvas')
    original_image_height: int | GraphNode | tuple[GraphNode, str] = Field(default=855, description='The desired height of the original image, inside the full canvas')
    original_image_x: int | GraphNode | tuple[GraphNode, str] = Field(default=301, description='The desired x-coordinate of the original image, inside the full canvas')
    original_image_y: int | GraphNode | tuple[GraphNode, str] = Field(default=-66, description='The desired y-coordinate of the original image, inside the full canvas')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text on which you wish to base the image expansion')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use when generating images')
    num_images: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Number of images to generate')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.BriaExpand"



class BriaGenFill(GraphNode):
    """Bria GenFill enables high-quality object addition or visual transformation. Trained exclusively on licensed data for safe and risk-free commercial use.
    image, generation, filling, transformation

    Use cases:
    - Add new objects to existing images
    - Transform specific image areas
    - Generate contextual content
    - Create seamless visual additions
    - Produce professional image modifications
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image to erase from')
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The mask for areas to be cleaned')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate images')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use when generating images')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.BriaGenFill"



class BriaProductShot(GraphNode):
    """Place any product in any scenery with just a prompt or reference image while maintaining high integrity of the product. Trained exclusively on licensed data for safe and risk-free commercial use and optimized for eCommerce.
    image, product, placement, ecommerce

    Use cases:
    - Create professional product photography
    - Generate contextual product shots
    - Place products in custom environments
    - Create eCommerce product listings
    - Generate marketing visuals
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The product image to be placed')
    scene_description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text description of the new scene/background')
    ref_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Reference image for the new scene/background')
    optimize_description: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to optimize the scene description')
    placement_type: str | GraphNode | tuple[GraphNode, str] = Field(default='manual_placement', description='How to position the product (original, automatic, manual_placement, manual_padding)')
    manual_placement_selection: str | GraphNode | tuple[GraphNode, str] = Field(default='bottom_center', description='Specific placement position when using manual_placement')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.BriaProductShot"


import nodetool.nodes.fal.text_to_image

class FluxDevRedux(GraphNode):
    """
    FLUX.1 [dev] Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications.
    image, transformation, style-transfer, development, flux

    Use cases:
    - Transform images with advanced controls
    - Create customized image variations
    - Apply precise style modifications
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxDevRedux.ImageSizePreset
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to transform')
    image_size: nodetool.nodes.fal.text_to_image.FluxDevRedux.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='How closely the model should stick to your prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.FluxDevRedux"


import nodetool.nodes.fal.text_to_image

class FluxLoraCanny(GraphNode):
    """FLUX LoRA Canny enables precise control over composition and style through edge detection and LoRA-based guidance mechanisms.
    image, edge, lora, style-transfer, control

    Use cases:
    - Generate stylized images with structural control
    - Create edge-guided artistic transformations
    - Apply custom styles while maintaining composition
    - Produce consistent style variations
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxLoraCanny.ImageSizePreset
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The control image to generate the Canny edge map from')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxLoraCanny.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='How closely the model should stick to your prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='The strength of the LoRA adaptation')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.FluxLoraCanny"


import nodetool.nodes.fal.text_to_image

class FluxLoraDepth(GraphNode):
    """FLUX LoRA Depth enables precise control over composition and structure through depth map detection and LoRA-based guidance mechanisms.
    image, depth, lora, structure, control

    Use cases:
    - Generate depth-aware stylized images
    - Create 3D-conscious artistic transformations
    - Maintain spatial relationships with custom styles
    - Produce depth-consistent variations
    - Generate images with controlled perspective
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxLoraDepth.ImageSizePreset
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The control image to generate the depth map from')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxLoraDepth.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='How closely the model should stick to your prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')
    lora_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='The strength of the LoRA adaptation')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.FluxLoraDepth"


import nodetool.nodes.fal.text_to_image

class FluxProCanny(GraphNode):
    """FLUX.1 [pro] Canny enables precise control over composition, style, and structure through advanced edge detection and guidance mechanisms.
    image, edge, composition, style, control

    Use cases:
    - Generate images with precise structural control
    - Create artwork based on edge maps
    - Transform sketches into detailed images
    - Maintain specific compositional elements
    - Generate variations with consistent structure
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxProCanny.ImageSizePreset
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The control image to generate the Canny edge map from')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxProCanny.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='How closely the model should stick to your prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')
    safety_tolerance: str | GraphNode | tuple[GraphNode, str] = Field(default='2', description='Safety tolerance level (1-6, 1 being most strict)')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.FluxProCanny"


import nodetool.nodes.fal.text_to_image

class FluxProDepth(GraphNode):
    """FLUX.1 [pro] Depth enables precise control over composition and structure through depth map detection and guidance mechanisms.
    image, depth-map, composition, structure, control

    Use cases:
    - Generate images with controlled depth perception
    - Create 3D-aware image transformations
    - Maintain spatial relationships in generated images
    - Produce images with accurate perspective
    - Generate variations with consistent depth structure
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxProDepth.ImageSizePreset
    control_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The control image to generate the depth map from')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate an image from')
    image_size: nodetool.nodes.fal.text_to_image.FluxProDepth.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='How closely the model should stick to your prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')
    safety_tolerance: str | GraphNode | tuple[GraphNode, str] = Field(default='2', description='Safety tolerance level (1-6, 1 being most strict)')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.FluxProDepth"



class FluxProFill(GraphNode):
    """FLUX.1 [pro] Fill is a high-performance endpoint that enables rapid transformation of existing images with inpainting/outpainting capabilities.
    image, inpainting, outpainting, transformation, professional

    Use cases:
    - Fill in missing or masked parts of images
    - Extend images beyond their original boundaries
    - Remove and replace unwanted elements
    - Create seamless image completions
    - Generate context-aware image content
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to transform')
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The mask for inpainting')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to fill the masked part of the image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')
    safety_tolerance: str | GraphNode | tuple[GraphNode, str] = Field(default='2', description='Safety tolerance level (1-6, 1 being most strict)')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.FluxProFill"


import nodetool.nodes.fal.text_to_image

class FluxProRedux(GraphNode):
    """
    FLUX.1 [pro] Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications.
    image, transformation, style-transfer, flux

    Use cases:
    - Create professional image transformations
    - Generate style transfers
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxProRedux.ImageSizePreset
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to transform')
    image_size: nodetool.nodes.fal.text_to_image.FluxProRedux.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='How closely the model should stick to your prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')
    safety_tolerance: str | GraphNode | tuple[GraphNode, str] = Field(default='2', description='Safety tolerance level (1-6, 1 being most strict)')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.FluxProRedux"


import nodetool.nodes.fal.text_to_image

class FluxProUltraRedux(GraphNode):
    """
    FLUX1.1 [pro] ultra Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.
    image, transformation, style-transfer, ultra, professional

    Use cases:
    - Apply precise image modifications
    - Process images with maximum control
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxProUltraRedux.ImageSizePreset
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to transform')
    image_size: nodetool.nodes.fal.text_to_image.FluxProUltraRedux.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=28, description='The number of inference steps to perform')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='How closely the model should stick to your prompt')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')
    safety_tolerance: str | GraphNode | tuple[GraphNode, str] = Field(default='2', description='Safety tolerance level (1-6, 1 being most strict)')
    image_prompt_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='The strength of the image prompt, between 0 and 1')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.FluxProUltraRedux"


import nodetool.nodes.fal.text_to_image

class FluxSchnellRedux(GraphNode):
    """
    FLUX.1 [schnell] Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.
    image, transformation, style-transfer, fast, flux

    Use cases:
    - Transform images with style transfers
    - Apply artistic modifications to photos
    - Create image variations
    """

    ImageSizePreset: typing.ClassVar[type] = nodetool.nodes.fal.text_to_image.FluxSchnellRedux.ImageSizePreset
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to transform')
    image_size: nodetool.nodes.fal.text_to_image.FluxSchnellRedux.ImageSizePreset = Field(default=ImageSizePreset.LANDSCAPE_4_3, description='The size of the generated image')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='The number of inference steps to perform')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')
    enable_safety_checker: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If true, the safety checker will be enabled')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.FluxSchnellRedux"



class IdeogramV2Edit(GraphNode):
    """Transform existing images with Ideogram V2's editing capabilities. Modify, adjust, and refine images while maintaining high fidelity and realistic outputs with precise prompt control.
    image, editing, transformation, fidelity, control

    Use cases:
    - Edit specific parts of images with precision
    - Create targeted image modifications
    - Refine and enhance image details
    - Generate contextual image edits
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to fill the masked part of the image')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to edit')
    mask: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The mask for editing')
    style: str | GraphNode | tuple[GraphNode, str] = Field(default='auto', description='Style of generated image (auto, general, realistic, design, render_3D, anime)')
    expand_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to expand the prompt with MagicPrompt functionality')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.IdeogramV2Edit"



class IdeogramV2Remix(GraphNode):
    """Reimagine existing images with Ideogram V2's remix feature. Create variations and adaptations while preserving core elements and adding new creative directions through prompt guidance.
    image, remix, variation, creativity, adaptation

    Use cases:
    - Create artistic variations of images
    - Generate style-transferred versions
    - Produce creative image adaptations
    - Transform images while preserving key elements
    - Generate alternative interpretations
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to remix the image with')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to remix')
    aspect_ratio: str | GraphNode | tuple[GraphNode, str] = Field(default='1:1', description='The aspect ratio of the generated image')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Strength of the input image in the remix')
    expand_prompt: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to expand the prompt with MagicPrompt functionality')
    style: str | GraphNode | tuple[GraphNode, str] = Field(default='auto', description='Style of generated image (auto, general, realistic, design, render_3D, anime)')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same image every time')

    @classmethod
    def get_node_type(cls): return "fal.image_to_image.IdeogramV2Remix"


