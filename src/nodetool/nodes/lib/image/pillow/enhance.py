import PIL.Image
import PIL.ImageOps
import PIL.ImageFilter
import PIL.ImageEnhance
import numpy as np

from nodetool.metadata.types import Field, ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field


def adaptive_contrast(
    image: PIL.Image.Image, clip_limit: float, grid_size: int
) -> PIL.Image.Image:
    import cv2

    img = np.array(image)

    # Convert image from BGR to LAB color model
    img_lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab)

    # Split the LAB image into L, A and B channels
    l, a, b = cv2.split(img_lab)

    # Perform histogram equalization only on the L channel
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(grid_size, grid_size))
    cl = clahe.apply(l)

    # Merge the CLAHE enhanced L channel with the original A and B channel
    merged_channels = cv2.merge((cl, a, b))

    # Convert image from LAB color model back to BGR
    final_img = cv2.cvtColor(merged_channels, cv2.COLOR_Lab2BGR)

    return PIL.Image.fromarray(final_img)


def sharpen_image(image: PIL.Image.Image) -> PIL.Image.Image:
    # Convert PIL image to CV
    import cv2

    img = np.array(image)
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    img_enhanced = cv2.filter2D(img, -1, kernel)
    return PIL.Image.fromarray(img_enhanced)


def canny_edge_detection(
    image: PIL.Image.Image, low_threshold: int, high_threshold: int
) -> PIL.Image.Image:
    import cv2

    arr = np.array(image)
    arr = cv2.Canny(arr, low_threshold, high_threshold)  # type: ignore
    arr = arr[:, :, None]
    arr = np.concatenate([arr, arr, arr], axis=2)
    return PIL.Image.fromarray(arr)


class AutoContrast(BaseNode):
    """
    Automatically adjusts image contrast for enhanced visual quality.
    image, contrast, balance

    Use cases:
    - Enhance image clarity for better visual perception
    - Pre-process images for computer vision tasks
    - Improve photo aesthetics in editing workflows
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to adjust the contrast for."
    )
    cutoff: int = Field(default=0, ge=0, le=255, description="Represents the percentage of pixels to ignore at both the darkest and lightest ends of the histogram. A cutoff value of 5 means ignoring the darkest 5% and the lightest 5% of pixels, enhancing overall contrast by stretching the remaining pixel values across the full brightness range.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        img = PIL.ImageOps.autocontrast(image, cutoff=self.cutoff)
        return await context.image_from_pil(img)


class Sharpness(BaseNode):
    """
    Adjusts image sharpness to enhance or reduce detail clarity.
    image, clarity, sharpness

    Use cases:
    - Enhance photo details for improved visual appeal
    - Refine images for object detection tasks
    - Correct slightly blurred images
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to adjust the brightness for."
    )
    factor: float = Field(
        default=1.0, description="Factor to adjust the contrast. 1.0 means no change."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageEnhance.Sharpness(image).enhance(self.factor)
        return await context.image_from_pil(res)


class Equalize(BaseNode):
    """
    Enhances image contrast by equalizing intensity distribution.
    image, contrast, histogram

    Use cases:
    - Improve visibility in poorly lit images
    - Enhance details for image analysis tasks
    - Normalize image data for machine learning
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to equalize.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageOps.equalize(image)
        return await context.image_from_pil(res)


class Contrast(BaseNode):
    """
    Adjusts image contrast to modify light-dark differences.
    image, contrast, enhance

    Use cases:
    - Enhance visibility of details in low-contrast images
    - Prepare images for visual analysis or recognition tasks
    - Create dramatic effects in artistic photography
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to adjust the brightness for."
    )
    factor: float = Field(
        default=1.0, description="Factor to adjust the contrast. 1.0 means no change."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageEnhance.Contrast(image).enhance(self.factor)
        return await context.image_from_pil(res)


class EdgeEnhance(BaseNode):
    """
    Enhances edge visibility by increasing contrast along boundaries.
    image, edge, enhance

    Use cases:
    - Improve object boundary detection for computer vision
    - Highlight structural elements in technical drawings
    - Prepare images for feature extraction in image analysis
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to edge enhance."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.EDGE_ENHANCE))


class Sharpen(BaseNode):
    """
    Enhances image detail by intensifying local pixel contrast.
    image, sharpen, clarity

    Use cases:
    - Improve clarity of photographs for print or display
    - Refine texture details in product photography
    - Enhance readability of text in document images
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to sharpen.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.SHARPEN))


class RankFilter(BaseNode):
    """
    Applies rank-based filtering to enhance or smooth image features.
    image, filter, enhance

    Use cases:
    - Reduce noise while preserving edges in images
    - Enhance specific image features based on local intensity
    - Pre-process images for improved segmentation results
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to rank filter.")
    size: int = Field(default=3, ge=1, le=512, description="Rank filter size.")
    rank: int = Field(default=3, ge=1, le=512, description="Rank filter rank.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(
            image.filter(PIL.ImageFilter.RankFilter(self.size, self.rank))
        )


class UnsharpMask(BaseNode):
    """
    Sharpens images using the unsharp mask technique.
    image, sharpen, enhance

    Use cases:
    - Enhance edge definition in photographs
    - Improve perceived sharpness of digital artwork
    - Prepare images for high-quality printing or display
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to unsharp mask."
    )
    radius: int = Field(default=2, ge=0, le=512, description="Unsharp mask radius.")
    percent: int = Field(
        default=150, ge=0, le=1000, description="Unsharp mask percent."
    )
    threshold: int = Field(
        default=3, ge=0, le=512, description="Unsharp mask threshold."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = image.filter(
            PIL.ImageFilter.UnsharpMask(self.radius, self.percent, self.threshold)
        )
        return await context.image_from_pil(res)


class Brightness(BaseNode):
    """
    Adjusts overall image brightness to lighten or darken.
    image, brightness, enhance

    Use cases:
    - Correct underexposed or overexposed photographs
    - Enhance visibility of dark image regions
    - Prepare images for consistent display across devices
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to adjust the brightness for."
    )
    factor: float | int = Field(
        default=1.0, description="Factor to adjust the brightness. 1.0 means no change."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(
            PIL.ImageEnhance.Brightness(image).enhance(self.factor)
        )


class Color(BaseNode):
    """
    Adjusts color intensity of an image.
    image, color, enhance

    Use cases:
    - Enhance color vibrancy in photographs
    - Correct color imbalances in digital images
    - Prepare images for consistent brand color representation
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to adjust the brightness for."
    )
    factor: float = Field(
        default=1.0, description="Factor to adjust the contrast. 1.0 means no change."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageEnhance.Color(image).enhance(self.factor)
        return await context.image_from_pil(res)


class Detail(BaseNode):
    """
    Enhances fine details in images.
    image, detail, enhance

    Use cases:
    - Improve clarity of textural elements in photographs
    - Enhance visibility of small features for analysis
    - Prepare images for high-resolution display or printing
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to detail.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.DETAIL))


class AdaptiveContrast(BaseNode):
    """
    Applies localized contrast enhancement using adaptive techniques.
    image, contrast, enhance

    Use cases:
    - Improve visibility in images with varying lighting conditions
    - Prepare images for improved feature detection in computer vision
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to adjust the contrast for."
    )
    clip_limit: float = Field(
        default=2.0, ge=0.0, le=100, description="Clip limit for adaptive contrast."
    )
    grid_size: int = Field(
        default=8, ge=1, le=64, description="Grid size for adaptive contrast."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        img = adaptive_contrast(
            image, clip_limit=self.clip_limit, grid_size=self.grid_size
        )
        return await context.image_from_pil(img)
