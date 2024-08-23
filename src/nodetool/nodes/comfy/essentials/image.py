from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import ImageRef, Mask, Latent, VAE, REMBGSession
from pydantic import Field
from enum import Enum
from typing import Optional, List, Tuple


class ImageEnhanceDifference(ComfyNode):
    """
    Enhance the difference between two images.
    image, difference, comparison

    Use cases:
    - Highlight changes between image versions
    - Analyze image modifications
    - Create visual effects based on image differences
    """

    _comfy_class = "ImageEnhanceDifference+"

    image1: ImageRef = Field(default=ImageRef(), description="The first image")
    image2: ImageRef = Field(default=ImageRef(), description="The second image")
    exponent: float = Field(
        default=0.75,
        ge=0.00,
        le=1.00,
        description="Exponent for difference calculation",
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageBatchMultiple(ComfyNode):
    """
    Combine multiple images into a batch.
    batch, combine, multiple

    Use cases:
    - Prepare image sets for batch processing
    - Merge images from different sources
    - Create image collections for analysis
    """

    _comfy_class = "ImageBatchMultiple+"

    image_1: ImageRef = Field(
        default=ImageRef(), description="First image in the batch"
    )
    method: str = Field(
        default="lanczos", description="Interpolation method for resizing"
    )
    image_2: Optional[ImageRef] = Field(
        default=None, description="Second image (optional)"
    )
    image_3: Optional[ImageRef] = Field(
        default=None, description="Third image (optional)"
    )
    image_4: Optional[ImageRef] = Field(
        default=None, description="Fourth image (optional)"
    )
    image_5: Optional[ImageRef] = Field(
        default=None, description="Fifth image (optional)"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageExpandBatch(ComfyNode):
    """
    Expand an image batch to a specified size.
    batch, expand, resize

    Use cases:
    - Increase batch size for processing
    - Duplicate images to meet batch requirements
    - Adjust batch size for model input
    """

    _comfy_class = "ImageExpandBatch+"

    image: ImageRef = Field(default=ImageRef(), description="Input image batch")
    size: int = Field(default=16, ge=1, description="Target batch size")
    method: str = Field(default="expand", description="Method for expanding the batch")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageFromBatch(ComfyNode):
    """
    Extract a subset of images from a batch.
    batch, extract, subset

    Use cases:
    - Select specific images from a larger batch
    - Divide a batch into smaller sets
    - Isolate images for individual processing
    """

    _comfy_class = "ImageFromBatch+"

    image: ImageRef = Field(default=ImageRef(), description="Input image batch")
    start: int = Field(default=0, ge=0, description="Starting index")
    length: int = Field(default=-1, ge=-1, description="Number of images to extract")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageListToBatch(ComfyNode):
    """
    Convert a list of images to an image batch.
    list, batch, convert

    Use cases:
    - Prepare individual images for batch processing
    - Combine images from different sources into a batch
    - Standardize image formats for model input
    """

    _comfy_class = "ImageListToBatch+"

    image: List[ImageRef] = Field(
        default_factory=list, description="List of input images"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageCompositeFromMaskBatch(ComfyNode):
    """
    Create a composite image from two images and a mask in batch.
    composite, mask, batch

    Use cases:
    - Blend multiple image pairs using masks
    - Create layered effects for image sets
    - Batch process image compositions
    """

    _comfy_class = "ImageCompositeFromMaskBatch+"

    image_from: ImageRef = Field(default=ImageRef(), description="Source image batch")
    image_to: ImageRef = Field(
        default=ImageRef(), description="Destination image batch"
    )
    mask: Mask = Field(default=Mask(), description="Mask for compositing")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageComposite(ComfyNode):
    """
    Composite one image onto another at specified coordinates.
    composite, overlay, position

    Use cases:
    - Add watermarks or logos to images
    - Create collages or image layouts
    - Overlay elements on background images
    """

    _comfy_class = "ImageComposite+"

    destination: ImageRef = Field(default=ImageRef(), description="Destination image")
    source: ImageRef = Field(
        default=ImageRef(), description="Source image to composite"
    )
    x: int = Field(default=0, description="X coordinate for placement")
    y: int = Field(default=0, description="Y coordinate for placement")
    offset_x: int = Field(default=0, description="X offset")
    offset_y: int = Field(default=0, description="Y offset")
    mask: Optional[Mask] = Field(
        default=None, description="Optional mask for compositing"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageResize(ComfyNode):
    """
    Resize an image to specified dimensions.
    resize, scale, dimensions

    Use cases:
    - Standardize image sizes for processing
    - Create thumbnails or previews
    - Adjust images for specific display requirements
    """

    _comfy_class = "ImageResize+"

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    width: int = Field(default=512, ge=0, description="Target width")
    height: int = Field(default=512, ge=0, description="Target height")
    interpolation: str = Field(default="nearest", description="Interpolation method")
    method: str = Field(default="stretch", description="Resizing method")
    condition: str = Field(default="always", description="Condition for resizing")
    multiple_of: int = Field(
        default=0, ge=0, description="Ensure dimensions are multiple of this value"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "width": int, "height": int}


class ImageFlip(ComfyNode):
    """
    Flip an image horizontally or vertically.
    flip, mirror, rotate

    Use cases:
    - Create mirror images
    - Augment data for machine learning
    - Correct image orientations
    """

    _comfy_class = "ImageFlip+"

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    axis: str = Field(default="x", description="Axis to flip (x, y, or xy)")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageCrop(ComfyNode):
    """
    Crop an image to specified dimensions and position.
    crop, trim, extract

    Use cases:
    - Focus on specific areas of images
    - Remove unwanted parts of images
    - Create uniform image sizes from varied inputs
    """

    _comfy_class = "ImageCrop+"

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    width: int = Field(default=256, ge=0, description="Crop width")
    height: int = Field(default=256, ge=0, description="Crop height")
    position: str = Field(default="center", description="Crop position")
    x_offset: int = Field(default=0, description="X offset for cropping")
    y_offset: int = Field(default=0, description="Y offset for cropping")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "x": int, "y": int}


class ImageTile(ComfyNode):
    """
    Divide an image into tiles.
    tile, grid, partition

    Use cases:
    - Prepare images for tiled processing
    - Create image mosaics
    - Analyze image sections separately
    """

    _comfy_class = "ImageTile+"

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    rows: int = Field(default=2, ge=1, le=256, description="Number of rows")
    cols: int = Field(default=2, ge=1, le=256, description="Number of columns")
    overlap: float = Field(default=0, ge=0, le=0.5, description="Overlap between tiles")
    overlap_x: int = Field(default=0, ge=0, description="X overlap in pixels")
    overlap_y: int = Field(default=0, ge=0, description="Y overlap in pixels")

    @classmethod
    def return_type(cls):
        return {
            "image": ImageRef,
            "tile_width": int,
            "tile_height": int,
            "overlap_x": int,
            "overlap_y": int,
        }


class ImageUntile(ComfyNode):
    """
    Reconstruct an image from tiles.
    untile, merge, reconstruct

    Use cases:
    - Combine processed image tiles
    - Reconstruct images after tiled analysis
    - Create panoramas from image sections
    """

    _comfy_class = "ImageUntile+"

    tiles: ImageRef = Field(default=ImageRef(), description="Tiled image input")
    overlap_x: int = Field(default=0, ge=0, description="X overlap between tiles")
    overlap_y: int = Field(default=0, ge=0, description="Y overlap between tiles")
    rows: int = Field(default=2, ge=1, le=256, description="Number of rows")
    cols: int = Field(default=2, ge=1, le=256, description="Number of columns")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageColorMatch(ComfyNode):
    """
    Match the color distribution of one image to another.
    color, match, transfer

    Use cases:
    - Harmonize colors across multiple images
    - Apply color grading effects
    - Correct color inconsistencies in image sets
    """

    _comfy_class = "ImageColorMatch+"

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    reference: ImageRef = Field(
        default=ImageRef(), description="Reference image for color matching"
    )
    color_space: str = Field(default="LAB", description="Color space for matching")
    factor: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Strength of color matching"
    )
    device: str = Field(default="auto", description="Computation device")
    batch_size: int = Field(default=0, ge=0, description="Batch size for processing")
    reference_mask: Optional[Mask] = Field(
        default=None, description="Optional mask for reference image"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageSmartSharpen(ComfyNode):
    """
    Apply intelligent sharpening to an image.
    sharpen, enhance, detail

    Use cases:
    - Improve image clarity and detail
    - Enhance edges while preserving smooth areas
    - Prepare images for high-quality display or printing
    """

    _comfy_class = "ImageSmartSharpen+"

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    noise_radius: int = Field(
        default=7, ge=1, le=25, description="Radius for noise reduction"
    )
    preserve_edges: float = Field(
        default=0.75, ge=0.0, le=1.0, description="Edge preservation strength"
    )
    sharpen: float = Field(
        default=5.0, ge=0.0, le=25.0, description="Sharpening intensity"
    )
    ratio: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Blend ratio of sharpened and original image",
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImagePreviewFromLatent(ComfyNode):
    """
    Generate a preview image from a latent representation.
    preview, latent, decode

    Use cases:
    - Visualize latent space representations
    - Debug generative model outputs
    - Create quick previews of latent manipulations
    """

    _comfy_class = "ImagePreviewFromLatent+"

    latent: Latent = Field(default=Latent(), description="Input latent representation")
    vae: VAE = Field(default=VAE(), description="VAE model for decoding")
    tile_size: int = Field(
        default=0, ge=0, le=4096, description="Tile size for decoding"
    )
    image: Optional[str] = Field(default="none", description="Optional input image")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "mask": Mask, "width": int, "height": int}


class NoiseFromImage(ComfyNode):
    """
    Generate noise based on an input image.
    noise, generate, image-based

    Use cases:
    - Create custom noise for image processing
    - Generate texture-like noise patterns
    - Produce image-specific distortion effects
    """

    _comfy_class = "NoiseFromImage+"

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    noise_strength: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Strength of noise"
    )
    noise_size: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Size of noise features"
    )
    color_noise: float = Field(
        default=0.2, ge=0.0, le=1.0, description="Amount of color noise"
    )
    mask_strength: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Strength of mask application"
    )
    mask_scale_diff: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Scale difference for mask"
    )
    mask_contrast: float = Field(
        default=1.0, ge=0.0, le=100.0, description="Contrast of mask"
    )
    saturation: float = Field(
        default=2.0, ge=0.0, le=100.0, description="Saturation of noise"
    )
    contrast: float = Field(
        default=1.0, ge=0.0, le=100.0, description="Contrast of noise"
    )
    blur: float = Field(
        default=1.0, ge=0.0, le=10.0, description="Blur amount for noise"
    )
    noise_mask: Optional[ImageRef] = Field(
        default=None, description="Optional mask for noise application"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}
