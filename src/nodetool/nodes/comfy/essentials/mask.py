from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import Mask, ImageRef
from pydantic import Field


class MaskBlur(ComfyNode):
    """
    Apply Gaussian blur to a mask.
    mask, blur, smoothing

    Use cases:
    - Soften mask edges for smoother transitions
    - Reduce noise or artifacts in masks
    - Create gradient effects in masks
    """

    _comfy_class = "MaskBlur+"

    mask: Mask = Field(default=Mask(), description="The input mask to blur.")
    amount: int = Field(default=6, ge=0, le=256, description="Blur amount.")
    device: str = Field(default="auto", description="Device to perform blur on.")

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class MaskFlip(ComfyNode):
    """
    Flip a mask along specified axis.
    mask, flip, mirror

    Use cases:
    - Create symmetrical masks
    - Correct orientation of imported masks
    - Generate variations of existing masks
    """

    _comfy_class = "MaskFlip+"

    mask: Mask = Field(default=Mask(), description="The input mask to flip.")
    axis: str = Field(default="x", description="Axis to flip along: 'x', 'y', or 'xy'.")

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class MaskPreview(ComfyNode):
    """
    Generate a preview image of a mask.
    mask, preview, visualization

    Use cases:
    - Visualize mask content during workflow
    - Debug mask generation steps
    - Export mask as viewable image
    """

    _comfy_class = "MaskPreview+"

    mask: Mask = Field(default=Mask(), description="The mask to preview.")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class MaskBatch(ComfyNode):
    """
    Combine multiple masks into a batch.
    mask, batch, combine

    Use cases:
    - Prepare multiple masks for batch processing
    - Combine masks from different sources
    - Create mask sequences for animations
    """

    _comfy_class = "MaskBatch+"

    mask1: Mask = Field(default=Mask(), description="First mask to batch.")
    mask2: Mask = Field(default=Mask(), description="Second mask to batch.")

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class MaskExpandBatch(ComfyNode):
    """
    Expand a mask batch to a specified size.
    mask, batch, expand

    Use cases:
    - Increase the number of masks in a batch
    - Replicate masks for extended animations
    - Adjust mask batch size for compatibility
    """

    _comfy_class = "MaskExpandBatch+"

    mask: Mask = Field(default=Mask(), description="The mask batch to expand.")
    size: int = Field(default=16, ge=1, description="Target batch size.")
    method: str = Field(default="expand", description="Method for expanding the batch.")

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class MaskBoundingBox(ComfyNode):
    """
    Compute the bounding box of a mask.
    mask, bounding box, crop

    Use cases:
    - Focus processing on relevant parts of a mask
    - Automatically crop masks to content
    - Extract region of interest from masks
    """

    _comfy_class = "MaskBoundingBox+"

    mask: Mask = Field(default=Mask(), description="The input mask.")
    padding: int = Field(
        default=0, ge=0, le=4096, description="Padding around bounding box."
    )
    blur: int = Field(
        default=0, ge=0, le=256, description="Blur amount for mask edges."
    )
    image_optional: ImageRef = Field(
        default=None, description="Optional image to crop alongside mask."
    )

    @classmethod
    def return_type(cls):
        return {
            "mask": Mask,
            "image": ImageRef,
            "x": int,
            "y": int,
            "width": int,
            "height": int,
        }


class MaskFromColor(ComfyNode):
    """
    Create a mask from a specific color in an image.
    mask, color, extraction

    Use cases:
    - Extract objects of a specific color
    - Create masks for color-coded regions
    - Isolate elements based on color information
    """

    _comfy_class = "MaskFromColor+"

    image: ImageRef = Field(default=ImageRef(), description="The input image.")
    red: int = Field(
        default=255, ge=0, le=255, description="Red component of target color."
    )
    green: int = Field(
        default=255, ge=0, le=255, description="Green component of target color."
    )
    blue: int = Field(
        default=255, ge=0, le=255, description="Blue component of target color."
    )
    threshold: int = Field(
        default=0, ge=0, le=127, description="Color matching threshold."
    )

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class MaskFromSegmentation(ComfyNode):
    """
    Generate masks from image segmentation.
    mask, segmentation, color quantization

    Use cases:
    - Create masks for distinct regions in an image
    - Separate image elements based on color
    - Prepare masks for selective processing
    """

    _comfy_class = "MaskFromSegmentation+"

    image: ImageRef = Field(
        default=ImageRef(), description="The input image to segment."
    )
    segments: int = Field(
        default=6, ge=1, le=16, description="Number of color segments."
    )
    remove_isolated_pixels: int = Field(
        default=0, ge=0, le=32, description="Size of isolated pixel areas to remove."
    )
    remove_small_masks: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Relative size of small masks to remove.",
    )
    fill_holes: bool = Field(
        default=False, description="Whether to fill holes in masks."
    )

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class MaskFix(ComfyNode):
    """
    Apply various fixes and adjustments to a mask.
    mask, fix, adjust

    Use cases:
    - Clean up noisy or imperfect masks
    - Refine mask edges and shapes
    - Prepare masks for specific processing requirements
    """

    _comfy_class = "MaskFix+"

    mask: Mask = Field(default=Mask(), description="The input mask to fix.")
    erode_dilate: int = Field(
        default=0,
        ge=-256,
        le=256,
        description="Erode (negative) or dilate (positive) mask.",
    )
    fill_holes: int = Field(
        default=0, ge=0, le=128, description="Size of holes to fill."
    )
    remove_isolated_pixels: int = Field(
        default=0, ge=0, le=32, description="Size of isolated pixel areas to remove."
    )
    smooth: int = Field(
        default=0, ge=0, le=256, description="Smoothing amount for mask edges."
    )
    blur: int = Field(
        default=0, ge=0, le=256, description="Blur amount for entire mask."
    )

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class TransitionMask(ComfyNode):
    """
    Generate a sequence of transition masks.
    mask, transition, animation

    Use cases:
    - Create smooth transitions between images or videos
    - Generate mask sequences for special effects
    - Produce animated mask patterns
    """

    _comfy_class = "TransitionMask+"

    width: int = Field(default=512, ge=1, le=8192, description="Width of the mask.")
    height: int = Field(default=512, ge=1, le=8192, description="Height of the mask.")
    frames: int = Field(
        default=16, ge=1, le=9999, description="Total number of frames."
    )
    start_frame: int = Field(default=0, ge=0, description="Frame to start transition.")
    end_frame: int = Field(default=9999, ge=0, description="Frame to end transition.")
    transition_type: str = Field(
        default="horizontal slide", description="Type of transition effect."
    )
    timing_function: str = Field(
        default="linear", description="Timing function for transition."
    )

    @classmethod
    def return_type(cls):
        return {"mask": Mask}
