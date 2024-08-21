from nodetool.metadata.types import ImageRef, Mask, Latent, VAE, REMBGSession
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
from enum import Enum
from typing import Optional, List, Tuple


class ImageEnhanceDifference(BaseNode):
    """
    Enhance the difference between two images.
    image, difference, comparison

    Use cases:
    - Highlight changes between image versions
    - Analyze image modifications
    - Create visual effects based on image differences
    """

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


class ImageBatchMultiple(BaseNode):
    """
    Combine multiple images into a batch.
    batch, combine, multiple

    Use cases:
    - Prepare image sets for batch processing
    - Merge images from different sources
    - Create image collections for analysis
    """

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


class ImageExpandBatch(BaseNode):
    """
    Expand an image batch to a specified size.
    batch, expand, resize

    Use cases:
    - Increase batch size for processing
    - Duplicate images to meet batch requirements
    - Adjust batch size for model input
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image batch")
    size: int = Field(default=16, ge=1, description="Target batch size")
    method: str = Field(default="expand", description="Method for expanding the batch")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageFromBatch(BaseNode):
    """
    Extract a subset of images from a batch.
    batch, extract, subset

    Use cases:
    - Select specific images from a larger batch
    - Divide a batch into smaller sets
    - Isolate images for individual processing
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image batch")
    start: int = Field(default=0, ge=0, description="Starting index")
    length: int = Field(default=-1, ge=-1, description="Number of images to extract")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageListToBatch(BaseNode):
    """
    Convert a list of images to an image batch.
    list, batch, convert

    Use cases:
    - Prepare individual images for batch processing
    - Combine images from different sources into a batch
    - Standardize image formats for model input
    """

    image: List[ImageRef] = Field(
        default_factory=list, description="List of input images"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageCompositeFromMaskBatch(BaseNode):
    """
    Create a composite image from two images and a mask in batch.
    composite, mask, batch

    Use cases:
    - Blend multiple image pairs using masks
    - Create layered effects for image sets
    - Batch process image compositions
    """

    image_from: ImageRef = Field(default=ImageRef(), description="Source image batch")
    image_to: ImageRef = Field(
        default=ImageRef(), description="Destination image batch"
    )
    mask: Mask = Field(default=Mask(), description="Mask for compositing")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageComposite(BaseNode):
    """
    Composite one image onto another at specified coordinates.
    composite, overlay, position

    Use cases:
    - Add watermarks or logos to images
    - Create collages or image layouts
    - Overlay elements on background images
    """

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


class ImageResize(BaseNode):
    """
    Resize an image to specified dimensions.
    resize, scale, dimensions

    Use cases:
    - Standardize image sizes for processing
    - Create thumbnails or previews
    - Adjust images for specific display requirements
    """

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


class ImageFlip(BaseNode):
    """
    Flip an image horizontally or vertically.
    flip, mirror, rotate

    Use cases:
    - Create mirror images
    - Augment data for machine learning
    - Correct image orientations
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    axis: str = Field(default="x", description="Axis to flip (x, y, or xy)")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageCrop(BaseNode):
    """
    Crop an image to specified dimensions and position.
    crop, trim, extract

    Use cases:
    - Focus on specific areas of images
    - Remove unwanted parts of images
    - Create uniform image sizes from varied inputs
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    width: int = Field(default=256, ge=0, description="Crop width")
    height: int = Field(default=256, ge=0, description="Crop height")
    position: str = Field(default="center", description="Crop position")
    x_offset: int = Field(default=0, description="X offset for cropping")
    y_offset: int = Field(default=0, description="Y offset for cropping")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "x": int, "y": int}


class ImageTile(BaseNode):
    """
    Divide an image into tiles.
    tile, grid, partition

    Use cases:
    - Prepare images for tiled processing
    - Create image mosaics
    - Analyze image sections separately
    """

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


class ImageUntile(BaseNode):
    """
    Reconstruct an image from tiles.
    untile, merge, reconstruct

    Use cases:
    - Combine processed image tiles
    - Reconstruct images after tiled analysis
    - Create panoramas from image sections
    """

    tiles: ImageRef = Field(default=ImageRef(), description="Tiled image input")
    overlap_x: int = Field(default=0, ge=0, description="X overlap between tiles")
    overlap_y: int = Field(default=0, ge=0, description="Y overlap between tiles")
    rows: int = Field(default=2, ge=1, le=256, description="Number of rows")
    cols: int = Field(default=2, ge=1, le=256, description="Number of columns")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageColorMatch(BaseNode):
    """
    Match the color distribution of one image to another.
    color, match, transfer

    Use cases:
    - Harmonize colors across multiple images
    - Apply color grading effects
    - Correct color inconsistencies in image sets
    """

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


class ImageSmartSharpen(BaseNode):
    """
    Apply intelligent sharpening to an image.
    sharpen, enhance, detail

    Use cases:
    - Improve image clarity and detail
    - Enhance edges while preserving smooth areas
    - Prepare images for high-quality display or printing
    """

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


class ImagePreviewFromLatent(BaseNode):
    """
    Generate a preview image from a latent representation.
    preview, latent, decode

    Use cases:
    - Visualize latent space representations
    - Debug generative model outputs
    - Create quick previews of latent manipulations
    """

    latent: Latent = Field(default=Latent(), description="Input latent representation")
    vae: VAE = Field(default=VAE(), description="VAE model for decoding")
    tile_size: int = Field(
        default=0, ge=0, le=4096, description="Tile size for decoding"
    )
    image: Optional[str] = Field(default="none", description="Optional input image")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "mask": Mask, "width": int, "height": int}


class NoiseFromImage(BaseNode):
    """
    Generate noise based on an input image.
    noise, generate, image-based

    Use cases:
    - Create custom noise for image processing
    - Generate texture-like noise patterns
    - Produce image-specific distortion effects
    """

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


class ImageRandomTransform(BaseNode):
    """
    Apply random transformations to an image.
    random, transform, augment

    Use cases:
    - Data augmentation for machine learning
    - Create variations of images
    - Test image processing pipelines with diverse inputs
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    seed: int = Field(default=0, ge=0, description="Random seed for transformations")
    repeat: int = Field(
        default=1,
        ge=1,
        le=256,
        description="Number of times to repeat the transformation",
    )
    variation: float = Field(
        default=0.1, ge=0.0, le=1.0, description="Strength of variations"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageRemoveAlpha(BaseNode):
    """
    Remove the alpha channel from an image.
    alpha, remove, rgb

    Use cases:
    - Convert RGBA images to RGB
    - Prepare images for formats or processes that don't support alpha
    - Simplify image data for certain analyses
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageSeamCarving(BaseNode):
    """
    Resize an image using content-aware seam carving.
    resize, content-aware, seam-carving

    Use cases:
    - Resize images while preserving important content
    - Remove or expand specific areas of an image
    - Create dynamic image layouts
    """

    class SeamCarvingOrder(str, Enum):
        WIDTH_FIRST = "width-first"
        HEIGHT_FIRST = "height-first"

    class SeamCarvingEnergy(str, Enum):
        BACKWARD = "backward"
        FORWARD = "forward"

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    width: int = Field(default=512, ge=1, description="Target width")
    height: int = Field(default=512, ge=1, description="Target height")
    energy: SeamCarvingEnergy = Field(
        default="backward", description="Energy calculation method"
    )
    order: SeamCarvingOrder = Field(
        default="width-first", description="Seam removal order"
    )
    keep_mask: Mask = Field(default=Mask(), description="Mask of areas to preserve")
    drop_mask: Mask = Field(default=Mask(), description="Mask of areas to remove")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class RemBGSession(BaseNode):
    """
    Create a session for background removal.
    background-removal, session, setup

    Use cases:
    - Prepare for batch background removal
    - Set up consistent background removal settings
    - Initialize specialized background removal models
    """

    model: str = Field(
        default="u2net", description="Model to use for background removal"
    )
    providers: str = Field(default="CPU", description="Computation provider")

    @classmethod
    def return_type(cls):
        return {"rembg_session": REMBGSession}


class TransparentBGSession(BaseNode):
    """
    Create a session for transparent background processing.
    transparency, background, session

    Use cases:
    - Prepare for batch transparency processing
    - Set up consistent transparency settings
    - Initialize specialized transparency models
    """

    mode: str = Field(default="base", description="Processing mode")
    use_jit: bool = Field(default=True, description="Whether to use JIT compilation")

    @classmethod
    def return_type(cls):
        return {"rembg_session": REMBGSession}


class ImageRemoveBackground(BaseNode):
    """
    Remove the background from an image using a prepared session.
    background-removal, transparency, processing

    Use cases:
    - Extract subjects from images
    - Create transparent PNGs from opaque images
    - Prepare images for compositing
    """

    rembg_session: REMBGSession = Field(
        default=REMBGSession(), description="Background removal session"
    )
    image: ImageRef = Field(default=ImageRef(), description="Input image")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "mask": Mask}


class ImageApplyLUT(BaseNode):
    """
    Apply a Look-Up Table (LUT) to an image.
    color-grading, lut, filter

    Use cases:
    - Apply color grading effects
    - Implement film emulation looks
    - Standardize color treatment across images
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    lut_file: str = Field(default="", description="LUT file to apply")
    gamma_correction: bool = Field(default=True, description="Apply gamma correction")
    clip_values: bool = Field(default=True, description="Clip values to valid range")
    strength: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Strength of LUT application"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageCASharpening(BaseNode):
    """
    Apply Contrast Adaptive Sharpening to an image.
    sharpening, contrast-adaptive, enhance

    Use cases:
    - Enhance image details without oversharpening
    - Improve image clarity for display
    - Prepare images for upscaling
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    amount: float = Field(default=0.8, ge=0.0, le=1.0, description="Sharpening amount")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageDesaturate(BaseNode):
    """
    Reduce the saturation of an image.
    desaturate, color, adjustment

    Use cases:
    - Create partial or full grayscale images
    - Reduce color intensity for artistic effect
    - Prepare images for further color processing
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    factor: float = Field(
        default=1.00, ge=0.00, le=1.00, description="Desaturation factor"
    )
    method: str = Field(
        default="luminance (Rec.709)", description="Desaturation method"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class PixelOEPixelize(BaseNode):
    """
    Apply a pixelation effect to an image.
    pixelate, retro, effect

    Use cases:
    - Create retro-style graphics
    - Censor or obfuscate parts of images
    - Generate pixel art from photographs
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    downscale_mode: str = Field(default="contrast", description="Downscaling method")
    target_size: int = Field(
        default=128, ge=0, description="Target size for pixelation"
    )
    patch_size: int = Field(
        default=16, ge=4, le=32, description="Size of pixel patches"
    )
    thickness: int = Field(
        default=2, ge=1, le=16, description="Thickness of pixel borders"
    )
    color_matching: bool = Field(default=True, description="Enable color matching")
    upscale: bool = Field(default=True, description="Upscale the result")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImagePosterize(BaseNode):
    """
    Apply a posterization effect to an image.
    posterize, color-reduction, effect

    Use cases:
    - Create stylized, low-color images
    - Simplify image color palettes
    - Generate graphic art effects
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    threshold: float = Field(
        default=0.50, ge=0.00, le=1.00, description="Posterization threshold"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageColorMatchAdobe(BaseNode):
    """
    Match colors between images using Adobe-style algorithms.
    color-match, adobe, adjustment

    Use cases:
    - Professional color grading
    - Match colors across photo series
    - Implement advanced color transfer techniques
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    reference: ImageRef = Field(default=ImageRef(), description="Reference image")
    color_space: str = Field(default="RGB", description="Color space for matching")
    luminance_factor: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Luminance adjustment factor"
    )
    color_intensity_factor: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Color intensity factor"
    )
    fade_factor: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Fade factor for effect"
    )
    neutralization_factor: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Color neutralization factor"
    )
    device: str = Field(default="auto", description="Computation device")
    reference_mask: Optional[Mask] = Field(
        default=None, description="Optional mask for reference image"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageHistogramMatch(BaseNode):
    """
    Match the histogram of one image to another.
    histogram, match, color-adjustment

    Use cases:
    - Normalize image brightness and contrast
    - Match visual styles between images
    - Correct for different lighting conditions
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    reference: ImageRef = Field(default=ImageRef(), description="Reference image")
    method: str = Field(default="pytorch", description="Histogram matching method")
    factor: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Strength of histogram matching"
    )
    device: str = Field(default="auto", description="Computation device")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageToDevice(BaseNode):
    """
    Move an image to a specific computation device.
    device, transfer, optimization

    Use cases:
    - Optimize processing pipeline performance
    - Manage memory across different devices
    - Prepare images for device-specific operations
    """

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    device: str = Field(default="auto", description="Target device (auto, cpu, gpu)")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}
