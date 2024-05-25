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
    This node automatically adjusts the contrast of an image.

    The purpose of the Auto Contrast Node is to enhance the quality of an image by optimizing its contrast levels. It intelligently adjusts the contrast of an image so brighter areas are brightened further and darker areas darkened, balancing the image illumination. The degree of contrast adjustment can be configured using a cutoff setting.

    #### Applications
    - Image processing: Enhance the visual quality of images by balancing the contrast.
    - Pre-processing in computer vision: Prepare images for further analysis by improving their readability.
    - Photo editing: Adjust the contrast in images for aesthetic or clarity purposes.
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
    The Sharpness Node is used to apply a sharpness filter to images.

    The Sharpness Node adjusts the sharpness level of an image, allowing you to enhance or reduce its sharpness based on a factor you provide. A sharpness factor of 1.0 implies no change to the image's sharpness level.

    #### Applications
    - Photo editing: Enhance the sharpness of a particular photo to make it more visually appealing.
    - Image processing: It helps in refining images for purposes such as object detection, image recognition etc.
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
    The Equalize Node is used to apply an equalizing filter to an image.

    Equalizing an image helps in enhancing its contrast by spreading out the most frequent intensity values throughout the image. The Equalize Node accomplishes this by transforming the values in pixel intensity histograms to create a uniform distribution of grayscale values.

    #### Applications
    - Improving the quality of images have poor lighting conditions.
    - Enhancing the details of an image for better viewing or analysis.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to equalize.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageOps.equalize(image)
        return await context.image_from_pil(res)


class Contrast(BaseNode):
    """
    The Contrast Node is a simple tool that adjust the contrast of an image.

    The Contrast Node is used for modifying the distinction between the lightest and darkest areas of an image. It adjusts the contrast based on a provided factor. Setting the contrast factor to 1.0 will make no changes to the original image. Higher contrast makes the image more dynamic and lower contrast makes the image less dynamic.

    #### Applications
    - Altering the visibility of textures in an image.
    - Improving the clarity of an image for analysis or display.
    - Giving images a dramatic or subtle look according to preferences.
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
    This is a node that applies an edge enhance filter to an image.

    The Edge Enhance Node is used to improve the visibility of edges in an image. It is a type of image processing operation that enhances the edge contrast of an image, making the boundaries of objects within the image more pronounced. This node makes use of the edge enhance filter to perform its function.

    #### Applications
    - Image editing and enhancement: Enhancing the edges of an object in an image makes it easier to distinguish and recognize.
    - Object detection: Improving the edge contrast can make the process of object detection more accurate.
    - Digital art creation: Enhance edges of your artworks to add more contrast and depth.
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to edge enhance."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.EDGE_ENHANCE))


class Sharpen(BaseNode):
    """
    The Sharpen Node is a tool that applies a sharpening filter to an image.

    The primary purpose of this node is to enhance the visibility of details in an image. It performs this by intensifying the contrast of adjacent pixels, which provides a sharper and clearer image. It brings a new dimension of clarity, which is particularly useful in detecting subtle elements in images.

    #### Applications
    - Photo Editing: Enhancing the clarity of images to bring out small details.
    - Object Detection: To improve the detection accuracy by sharpening blurry images.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to sharpen.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.SHARPEN))


class RankFilter(BaseNode):
    """
    The Rank Filter Node is used to apply a rank filter to a given image.

    The purpose of this node is to perform a specific type of image processing technique, known as a rank filter. A rank filter considers the surrounding pixels of each pixel in the image and sorts them according to brightness. The 'rank' refers to the position of the pixel that will replace the current pixel - for example, a rank of 1 would replace each pixel with the darkest surrounding pixel, while a rank of 3 would replace it with the third darkest and so on. The 'size' indicates the total number of surrounding pixels to be considered for this process.

    This node is pivotal for tasks related to image enhancement and noise reduction and plays a major role in improving the visual quality of an image, making it more suitable for further processing and analysis.

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
    The ColorNode is a simple tool that applies a color filter to an image.

    It's an excellent option if you want to enhance or tweak the colors in your images for a specific visual effect. The node allows you to control the degree of color change through the factor input. A factor of 1.0 means no color change, while values greater or smaller than 1.0 increase or decrease the image's color intensity, respectively.

    #### Applications
    - Color grading: You can use it to adjust the colors in a photo for aesthetic purposes.
    - Highlighting features: Enhance colors to make certain areas of an image stand out.
    - Color correction: Correct or adjust the color balance in an image.
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
