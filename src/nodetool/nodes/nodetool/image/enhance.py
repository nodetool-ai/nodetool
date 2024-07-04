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
    1. Enhance image clarity for better visual perception
    2. Pre-process images for computer vision tasks
    3. Improve photo aesthetics in editing workflows
    4. Correct poorly lit or low-contrast images
    5. Prepare images for printing or display
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to adjust the contrast for."
    )
    cutoff: int = Field(default=0, ge=0, le=255, description="Cutoff for autocontrast.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        img = PIL.ImageOps.autocontrast(image, cutoff=self.cutoff)
        return await context.image_from_pil(img)


class Sharpness(BaseNode):
    """
    Adjusts image sharpness to enhance or reduce detail clarity.
    image, clarity, sharpness

    Use cases:
    1. Enhance photo details for improved visual appeal
    2. Refine images for object detection tasks
    3. Correct slightly blurred images
    4. Prepare images for print or digital display
    5. Adjust sharpness for artistic effect in digital art
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
    1. Improve visibility in poorly lit images
    2. Enhance details for image analysis tasks
    3. Normalize image data for machine learning
    4. Correct uneven lighting in photographs
    5. Prepare images for feature extraction
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
    1. Enhance visibility of details in low-contrast images
    2. Prepare images for visual analysis or recognition tasks
    3. Create dramatic effects in artistic photography
    4. Correct over or underexposed photographs
    5. Improve readability of text in scanned documents
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
    Enhances edge visibility in images by increasing edge contrast.
    image, edge, enhance

    Use cases:
    1. Improve object boundaries for computer vision tasks
    2. Enhance details in medical or scientific imaging
    3. Create artistic effects in digital photography
    4. Prepare images for feature extraction in image analysis
    5. Highlight structural elements in architectural or engineering drawings
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to edge enhance."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.EDGE_ENHANCE))


class Sharpen(BaseNode):
    """
    Enhances image detail by intensifying contrast between adjacent pixels.
    image, sharpen, clarity

    Use cases:
    1. Improve clarity of photographs for print or digital display
    2. Enhance details in medical imaging for diagnosis
    3. Sharpen blurry images for better object detection
    4. Refine texture details in product photography
    5. Increase readability of text in scanned documents
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to sharpen.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.SHARPEN))


class RankFilter(BaseNode):
    """
    The Rank Filter Node is used to apply a rank filter to a given image.
    image, enhance

    The purpose of this node is to perform a specific type of image processing technique, known as a rank filter. A rank filter considers the surrounding pixels of each pixel in the image and sorts them according to brightness. The 'rank' refers to the position of the pixel that will replace the current pixel - for example, a rank of 1 would replace each pixel with the darkest surrounding pixel, while a rank of 3 would replace it with the third darkest and so on. The 'size' indicates the total number of surrounding pixels to be considered for this process.

    #### Applications
    - Image enhancement: This node can be used to enhance the quality of an image, making subtle details more pronounced.
    - Noise reduction: The Rank Filter Node can help reduce 'noise' in images, i.e., unwanted or irrelevant details.
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
    The Unsharp Mask Node is responsible for performing the unsharp mask filter on an image.
    image, sharpening, enhance

    An unsharp mask is a photographic sharpening technique. This node helps to enhance the sharpness of your image by adjusting the radius, the impact and the threshold of the unsharp mask filter.

    #### Applications
    - Photo editing: Sharpens images by emphasizing transitions, such as those defining edges of objects in the image.
    - Digital art creation: Refining and adding crispness to digital artwork.
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
    The Brightness Node is designed to adjust the brightness of an image.
    image, highlight, dim

    Its main purpose is to alter the brightness of an uploaded image by using a customizable factor. The brightness of an image can influence its clarity and visibility. By changing the brightness levels, we can make portions of an image more visible or less distracting based on our needs.

    #### Applications
    - Brightness level correction: If an image is too dark or too bright, the Brightness Node can be used to correct the brightness levels to the desired range.
    - Highlighting or dimming certain parts of an image: The Brightness Node can be used to increase the visibility of certain parts of an image by enhancing their brightness.
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
    Adjusts color intensity of an image using a factor-based filter.
    image, color, enhance

    Use cases:
    1. Enhance color vibrancy in photographs
    2. Create mood-specific color grading for visual media
    3. Correct color imbalances in digital images
    4. Highlight specific features in scientific or medical imaging
    5. Prepare images for consistent brand color representation
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
    The DetailNode is an image detail filter.
    image, enhance

    This node is primarily designed to enhance the details of an image in an AI workflow by applying a detail filter. It is especially useful when you want to emphasize or highlight certain features of the image.

    #### Applications
    - Enhancing the details of an image to improve its clarity.
    - Highlighting certain features of an image for a deeper analysis.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to detail.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.DETAIL))


class AdaptiveContrast(BaseNode):
    """
    The Adaptive Contrast Node is used to adjust the contrasting visual aspects of an image.

    This node enhances the contrast of the provided image on a localized level by adapting the contrast based on defined grid sizes, which means each section of the image will have its contrast adjusted individually compared to each other. The balance of brightness and darkness in different various parts of the image can be shifted using the clip limit field.

    #### Applications
    - Enhancing visual interest in an image by adjusting contrast.
    - Mitigation of contrasting errors in color-focused or texture-focused AI models.
    - For image restoration, where restoring the contrast levels can make old or degraded photos become clearer.
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
