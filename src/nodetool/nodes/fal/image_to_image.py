from typing import Any, Optional
from pydantic import Field

from nodetool.metadata.types import ImageRef
from nodetool.nodes.fal.fal_node import FALNode
from nodetool.workflows.processing_context import ProcessingContext
from .text_to_image import ImageSizePreset

class FluxSchnellRedux(FALNode):
    """
    FLUX.1 [schnell] Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.
    image, transformation, style-transfer, fast, flux

    Use cases:
    - Transform images with style transfers
    - Apply artistic modifications to photos
    - Create image variations
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to transform"
    )
    image_size: ImageSizePreset = Field(
        default=ImageSizePreset.LANDSCAPE_4_3,
        description="The size of the generated image"
    )
    num_inference_steps: int = Field(
        default=4,
        ge=1,
        description="The number of inference steps to perform"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )
    enable_safety_checker: bool = Field(
        default=True,
        description="If true, the safety checker will be enabled"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "image_size": self.image_size.value,
            "num_inference_steps": self.num_inference_steps,
            "enable_safety_checker": self.enable_safety_checker,
            "output_format": "png"
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/flux/schnell/redux",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "image_size", "num_inference_steps"]


class FluxDevRedux(FALNode):
    """
    FLUX.1 [dev] Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications.
    image, transformation, style-transfer, development, flux

    Use cases:
    - Transform images with advanced controls
    - Create customized image variations
    - Apply precise style modifications
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to transform"
    )
    image_size: ImageSizePreset = Field(
        default=ImageSizePreset.LANDSCAPE_4_3,
        description="The size of the generated image"
    )
    num_inference_steps: int = Field(
        default=28,
        ge=1,
        description="The number of inference steps to perform"
    )
    guidance_scale: float = Field(
        default=3.5,
        description="How closely the model should stick to your prompt"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )
    enable_safety_checker: bool = Field(
        default=True,
        description="If true, the safety checker will be enabled"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "image_size": self.image_size.value,
            "num_inference_steps": self.num_inference_steps,
            "guidance_scale": self.guidance_scale,
            "enable_safety_checker": self.enable_safety_checker,
            "output_format": "png"
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/flux/dev/redux",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "image_size", "guidance_scale"]


class FluxProRedux(FALNode):
    """
    FLUX.1 [pro] Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications.
    image, transformation, style-transfer, flux

    Use cases:
    - Create professional image transformations
    - Generate style transfers
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to transform"
    )
    image_size: ImageSizePreset = Field(
        default=ImageSizePreset.LANDSCAPE_4_3,
        description="The size of the generated image"
    )
    num_inference_steps: int = Field(
        default=28,
        ge=1,
        description="The number of inference steps to perform"
    )
    guidance_scale: float = Field(
        default=3.5,
        description="How closely the model should stick to your prompt"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )
    safety_tolerance: str = Field(
        default="2",
        description="Safety tolerance level (1-6, 1 being most strict)"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "image_size": self.image_size.value,
            "num_inference_steps": self.num_inference_steps,
            "guidance_scale": self.guidance_scale,
            "safety_tolerance": self.safety_tolerance,
            "output_format": "png"
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/flux-pro/v1/redux",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "image_size", "guidance_scale"]


class FluxProUltraRedux(FALNode):
    """
    FLUX1.1 [pro] ultra Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.
    image, transformation, style-transfer, ultra, professional

    Use cases:
    - Apply precise image modifications
    - Process images with maximum control
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to transform"
    )
    image_size: ImageSizePreset = Field(
        default=ImageSizePreset.LANDSCAPE_4_3,
        description="The size of the generated image"
    )
    num_inference_steps: int = Field(
        default=28,
        ge=1,
        description="The number of inference steps to perform"
    )
    guidance_scale: float = Field(
        default=3.5,
        description="How closely the model should stick to your prompt"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )
    safety_tolerance: str = Field(
        default="2",
        description="Safety tolerance level (1-6, 1 being most strict)"
    )
    image_prompt_strength: float = Field(
        default=0.1,
        description="The strength of the image prompt, between 0 and 1"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "image_size": self.image_size.value,
            "num_inference_steps": self.num_inference_steps,
            "guidance_scale": self.guidance_scale,
            "safety_tolerance": self.safety_tolerance,
            "image_prompt_strength": self.image_prompt_strength,
            "output_format": "png"
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/flux-pro/v1.1-ultra/redux",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "image_size", "guidance_scale"]


class FluxProFill(FALNode):
    """FLUX.1 [pro] Fill is a high-performance endpoint that enables rapid transformation of existing images with inpainting/outpainting capabilities.
    image, inpainting, outpainting, transformation, professional

    Use cases:
    - Fill in missing or masked parts of images
    - Extend images beyond their original boundaries
    - Remove and replace unwanted elements
    - Create seamless image completions
    - Generate context-aware image content
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to transform"
    )
    mask: ImageRef = Field(
        default=ImageRef(),
        description="The mask for inpainting"
    )
    prompt: str = Field(
        default="",
        description="The prompt to fill the masked part of the image"
    )
    num_inference_steps: int = Field(
        default=28,
        ge=1,
        description="The number of inference steps to perform"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )
    safety_tolerance: str = Field(
        default="2",
        description="Safety tolerance level (1-6, 1 being most strict)"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        mask_base64 = await context.image_to_base64(self.mask)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "mask_url": f"data:image/png;base64,{mask_base64}",
            "prompt": self.prompt,
            "num_inference_steps": self.num_inference_steps,
            "safety_tolerance": self.safety_tolerance,
            "output_format": "png"
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/flux-pro/v1/fill",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "mask", "prompt"]


class FluxProCanny(FALNode):
    """FLUX.1 [pro] Canny enables precise control over composition, style, and structure through advanced edge detection and guidance mechanisms.
    image, edge, composition, style, control

    Use cases:
    - Generate images with precise structural control
    - Create artwork based on edge maps
    - Transform sketches into detailed images
    - Maintain specific compositional elements
    - Generate variations with consistent structure
    """

    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to generate the Canny edge map from"
    )
    prompt: str = Field(
        default="",
        description="The prompt to generate an image from"
    )
    image_size: ImageSizePreset = Field(
        default=ImageSizePreset.LANDSCAPE_4_3,
        description="The size of the generated image"
    )
    num_inference_steps: int = Field(
        default=28,
        ge=1,
        description="The number of inference steps to perform"
    )
    guidance_scale: float = Field(
        default=3.5,
        description="How closely the model should stick to your prompt"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )
    safety_tolerance: str = Field(
        default="2",
        description="Safety tolerance level (1-6, 1 being most strict)"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        control_image_base64 = await context.image_to_base64(self.control_image)
        
        arguments = {
            "control_image_url": f"data:image/png;base64,{control_image_base64}",
            "prompt": self.prompt,
            "image_size": self.image_size.value,
            "num_inference_steps": self.num_inference_steps,
            "guidance_scale": self.guidance_scale,
            "safety_tolerance": self.safety_tolerance,
            "output_format": "png"
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/flux-pro/v1/canny",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["control_image", "prompt", "image_size"]


class FluxProDepth(FALNode):
    """FLUX.1 [pro] Depth enables precise control over composition and structure through depth map detection and guidance mechanisms.
    image, depth-map, composition, structure, control

    Use cases:
    - Generate images with controlled depth perception
    - Create 3D-aware image transformations
    - Maintain spatial relationships in generated images
    - Produce images with accurate perspective
    - Generate variations with consistent depth structure
    """

    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to generate the depth map from"
    )
    prompt: str = Field(
        default="",
        description="The prompt to generate an image from"
    )
    image_size: ImageSizePreset = Field(
        default=ImageSizePreset.LANDSCAPE_4_3,
        description="The size of the generated image"
    )
    num_inference_steps: int = Field(
        default=28,
        ge=1,
        description="The number of inference steps to perform"
    )
    guidance_scale: float = Field(
        default=3.5,
        description="How closely the model should stick to your prompt"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )
    safety_tolerance: str = Field(
        default="2",
        description="Safety tolerance level (1-6, 1 being most strict)"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        control_image_base64 = await context.image_to_base64(self.control_image)
        
        arguments = {
            "control_image_url": f"data:image/png;base64,{control_image_base64}",
            "prompt": self.prompt,
            "image_size": self.image_size.value,
            "num_inference_steps": self.num_inference_steps,
            "guidance_scale": self.guidance_scale,
            "safety_tolerance": self.safety_tolerance,
            "output_format": "png"
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/flux-pro/v1/depth",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["control_image", "prompt", "image_size"]


class FluxLoraCanny(FALNode):
    """FLUX LoRA Canny enables precise control over composition and style through edge detection and LoRA-based guidance mechanisms.
    image, edge, lora, style-transfer, control

    Use cases:
    - Generate stylized images with structural control
    - Create edge-guided artistic transformations
    - Apply custom styles while maintaining composition
    - Produce consistent style variations
    """

    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to generate the Canny edge map from"
    )
    prompt: str = Field(
        default="",
        description="The prompt to generate an image from"
    )
    image_size: ImageSizePreset = Field(
        default=ImageSizePreset.LANDSCAPE_4_3,
        description="The size of the generated image"
    )
    num_inference_steps: int = Field(
        default=28,
        ge=1,
        description="The number of inference steps to perform"
    )
    guidance_scale: float = Field(
        default=3.5,
        description="How closely the model should stick to your prompt"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )
    lora_scale: float = Field(
        default=0.6,
        description="The strength of the LoRA adaptation"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        control_image_base64 = await context.image_to_base64(self.control_image)
        
        arguments = {
            "control_image_url": f"data:image/png;base64,{control_image_base64}",
            "prompt": self.prompt,
            "image_size": self.image_size.value,
            "num_inference_steps": self.num_inference_steps,
            "guidance_scale": self.guidance_scale,
            "lora_scale": self.lora_scale,
            "output_format": "png"
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/flux-lora-canny",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["control_image", "prompt", "image_size"]


class FluxLoraDepth(FALNode):
    """FLUX LoRA Depth enables precise control over composition and structure through depth map detection and LoRA-based guidance mechanisms.
    image, depth, lora, structure, control

    Use cases:
    - Generate depth-aware stylized images
    - Create 3D-conscious artistic transformations
    - Maintain spatial relationships with custom styles
    - Produce depth-consistent variations
    - Generate images with controlled perspective
    """

    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to generate the depth map from"
    )
    prompt: str = Field(
        default="",
        description="The prompt to generate an image from"
    )
    image_size: ImageSizePreset = Field(
        default=ImageSizePreset.LANDSCAPE_4_3,
        description="The size of the generated image"
    )
    num_inference_steps: int = Field(
        default=28,
        ge=1,
        description="The number of inference steps to perform"
    )
    guidance_scale: float = Field(
        default=3.5,
        description="How closely the model should stick to your prompt"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )
    lora_scale: float = Field(
        default=0.6,
        description="The strength of the LoRA adaptation"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        control_image_base64 = await context.image_to_base64(self.control_image)
        
        arguments = {
            "control_image_url": f"data:image/png;base64,{control_image_base64}",
            "prompt": self.prompt,
            "image_size": self.image_size.value,
            "num_inference_steps": self.num_inference_steps,
            "guidance_scale": self.guidance_scale,
            "lora_scale": self.lora_scale,
            "output_format": "png"
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/flux-lora-depth",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["control_image", "prompt", "image_size"]


# ... existing code ...

class IdeogramV2Edit(FALNode):
    """Transform existing images with Ideogram V2's editing capabilities. Modify, adjust, and refine images while maintaining high fidelity and realistic outputs with precise prompt control.
    image, editing, transformation, fidelity, control

    Use cases:
    - Edit specific parts of images with precision
    - Create targeted image modifications
    - Refine and enhance image details
    - Generate contextual image edits
    """
    
    prompt: str = Field(
        default="",
        description="The prompt to fill the masked part of the image"
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="The image to edit"
    )
    mask: ImageRef = Field(
        default=ImageRef(),
        description="The mask for editing"
    )
    style: str = Field(
        default="auto",
        description="Style of generated image (auto, general, realistic, design, render_3D, anime)"
    )
    expand_prompt: bool = Field(
        default=True,
        description="Whether to expand the prompt with MagicPrompt functionality"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        mask_base64 = await context.image_to_base64(self.mask)
        
        arguments = {
            "prompt": self.prompt,
            "image_url": f"data:image/png;base64,{image_base64}",
            "mask_url": f"data:image/png;base64,{mask_base64}",
            "style": self.style,
            "expand_prompt": self.expand_prompt
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/ideogram/v2/edit",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["prompt", "image", "mask"]

class IdeogramV2Remix(FALNode):
    """Reimagine existing images with Ideogram V2's remix feature. Create variations and adaptations while preserving core elements and adding new creative directions through prompt guidance.
    image, remix, variation, creativity, adaptation

    Use cases:
    - Create artistic variations of images
    - Generate style-transferred versions
    - Produce creative image adaptations
    - Transform images while preserving key elements
    - Generate alternative interpretations
    """

    prompt: str = Field(
        default="",
        description="The prompt to remix the image with"
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="The image to remix"
    )
    aspect_ratio: str = Field(
        default="1:1",
        description="The aspect ratio of the generated image"
    )
    strength: float = Field(
        default=0.8,
        description="Strength of the input image in the remix"
    )
    expand_prompt: bool = Field(
        default=True,
        description="Whether to expand the prompt with MagicPrompt functionality"
    )
    style: str = Field(
        default="auto",
        description="Style of generated image (auto, general, realistic, design, render_3D, anime)"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "prompt": self.prompt,
            "image_url": f"data:image/png;base64,{image_base64}",
            "aspect_ratio": self.aspect_ratio,
            "strength": self.strength,
            "expand_prompt": self.expand_prompt,
            "style": self.style
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/ideogram/v2/remix",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["prompt", "image", "strength"]

class BriaEraser(FALNode):
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

    image: ImageRef = Field(
        default=ImageRef(),
        description="Input image to erase from"
    )
    mask: ImageRef = Field(
        default=ImageRef(),
        description="The mask for areas to be cleaned"
    )
    mask_type: str = Field(
        default="manual",
        description="Type of mask - 'manual' for user-created or 'automatic' for algorithm-generated"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        mask_base64 = await context.image_to_base64(self.mask)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "mask_url": f"data:image/png;base64,{mask_base64}",
            "mask_type": self.mask_type
        }

        res = await self.submit_request(
            context=context,
            application="fal-ai/bria/eraser",
            arguments=arguments,
        )
        assert "image" in res
        return ImageRef(uri=res["image"]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "mask"]

class BriaProductShot(FALNode):
    """Place any product in any scenery with just a prompt or reference image while maintaining high integrity of the product. Trained exclusively on licensed data for safe and risk-free commercial use and optimized for eCommerce.
    image, product, placement, ecommerce

    Use cases:
    - Create professional product photography
    - Generate contextual product shots
    - Place products in custom environments
    - Create eCommerce product listings
    - Generate marketing visuals
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The product image to be placed"
    )
    scene_description: str = Field(
        default="",
        description="Text description of the new scene/background"
    )
    ref_image: ImageRef = Field(
        default=ImageRef(),
        description="Reference image for the new scene/background"
    )
    optimize_description: bool = Field(
        default=True,
        description="Whether to optimize the scene description"
    )
    placement_type: str = Field(
        default="manual_placement",
        description="How to position the product (original, automatic, manual_placement, manual_padding)"
    )
    manual_placement_selection: str = Field(
        default="bottom_center",
        description="Specific placement position when using manual_placement"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        ref_image_base64 = await context.image_to_base64(self.ref_image) if self.ref_image.uri else ""
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "scene_description": self.scene_description,
            "ref_image_url": f"data:image/png;base64,{ref_image_base64}" if ref_image_base64 else "",
            "optimize_description": self.optimize_description,
            "placement_type": self.placement_type,
            "manual_placement_selection": self.manual_placement_selection,
            "shot_size": [1000, 1000],
            "fast": True
        }

        res = await self.submit_request(
            context=context,
            application="fal-ai/bria/product-shot",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "scene_description"]

class BriaBackgroundReplace(FALNode):
    """Bria Background Replace allows for efficient swapping of backgrounds in images via text prompts or reference image, delivering realistic and polished results. Trained exclusively on licensed data for safe and risk-free commercial use.
    image, background, replacement, swap

    Use cases:
    - Replace image backgrounds seamlessly
    - Create professional photo compositions
    - Generate custom scene settings
    - Produce commercial-ready images
    - Create consistent visual environments
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="Input image to replace background"
    )
    ref_image: ImageRef = Field(
        default=ImageRef(),
        description="Reference image for the new background"
    )
    prompt: str = Field(
        default="",
        description="Prompt to generate new background"
    )
    negative_prompt: str = Field(
        default="",
        description="Negative prompt for background generation"
    )
    refine_prompt: bool = Field(
        default=True,
        description="Whether to refine the prompt"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        ref_image_base64 = await context.image_to_base64(self.ref_image) if self.ref_image.uri else ""
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "ref_image_url": f"data:image/png;base64,{ref_image_base64}" if ref_image_base64 else "",
            "prompt": self.prompt,
            "negative_prompt": self.negative_prompt,
            "refine_prompt": self.refine_prompt,
            "fast": True,
            "num_images": 1
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/bria/background/replace",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])
    
    @classmethod
    def get_basic_fields(cls):
        return ["image", "prompt"]

class BriaGenFill(FALNode):
    """Bria GenFill enables high-quality object addition or visual transformation. Trained exclusively on licensed data for safe and risk-free commercial use.
    image, generation, filling, transformation

    Use cases:
    - Add new objects to existing images
    - Transform specific image areas
    - Generate contextual content
    - Create seamless visual additions
    - Produce professional image modifications
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="Input image to erase from"
    )
    mask: ImageRef = Field(
        default=ImageRef(),
        description="The mask for areas to be cleaned"
    )
    prompt: str = Field(
        default="",
        description="The prompt to generate images"
    )
    negative_prompt: str = Field(
        default="",
        description="The negative prompt to use when generating images"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        mask_base64 = await context.image_to_base64(self.mask)
        
        arguments: dict[str, Any] = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "mask_url": f"data:image/png;base64,{mask_base64}",
            "prompt": self.prompt,
            "negative_prompt": self.negative_prompt,
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/bria/genfill",
            arguments=arguments,
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "mask", "prompt"]

class BriaExpand(FALNode):
    """Bria Expand expands images beyond their borders in high quality. Trained exclusively on licensed data for safe and risk-free commercial use.
    image, expansion, outpainting

    Use cases:
    - Extend image boundaries seamlessly
    - Create wider or taller compositions
    - Expand images for different aspect ratios
    - Generate additional scene content
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to expand"
    )
    canvas_width: int = Field(
        default=1200,
        description="The desired width of the final image, after the expansion"
    )
    canvas_height: int = Field(
        default=674,
        description="The desired height of the final image, after the expansion"
    )
    original_image_width: int = Field(
        default=610,
        description="The desired width of the original image, inside the full canvas"
    )
    original_image_height: int = Field(
        default=855,
        description="The desired height of the original image, inside the full canvas"
    )
    original_image_x: int = Field(
        default=301,
        description="The desired x-coordinate of the original image, inside the full canvas"
    )
    original_image_y: int = Field(
        default=-66,
        description="The desired y-coordinate of the original image, inside the full canvas"
    )
    prompt: str = Field(
        default="",
        description="Text on which you wish to base the image expansion"
    )
    negative_prompt: str = Field(
        default="",
        description="The negative prompt to use when generating images"
    )
    num_images: int = Field(
        default=1,
        description="Number of images to generate"
    )
    seed: int = Field(
        default=-1,
        description="The same seed will output the same image every time"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}",
            "canvas_size": [self.canvas_width, self.canvas_height],
            "original_image_size": [self.original_image_width, self.original_image_height],
            "original_image_location": [self.original_image_x, self.original_image_y],
            "prompt": self.prompt,
            "negative_prompt": self.negative_prompt,
            "num_images": self.num_images
        }
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/bria/expand",
            arguments=arguments,
        )
        assert "image" in res
        return ImageRef(uri=res["image"]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image", "canvas_width", "canvas_height", "prompt"]

class BriaBackgroundRemove(FALNode):
    """
    Bria RMBG 2.0 enables seamless removal of backgrounds from images, ideal for professional editing tasks. 
    Trained exclusively on licensed data for safe and risk-free commercial use.
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="Input image to remove background from"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image_base64 = await context.image_to_base64(self.image)
        
        arguments = {
            "image_url": f"data:image/png;base64,{image_base64}"
        }

        res = await self.submit_request(
            context=context,
            application="fal-ai/bria/background/remove",
            arguments=arguments,
        )
        assert "image" in res
        return ImageRef(uri=res["image"]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["image"]