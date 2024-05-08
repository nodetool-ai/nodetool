import os
from enum import Enum
import PIL.Image
import PIL.ImageDraw
import PIL.ImageEnhance
import PIL.ImageFilter
import PIL.ImageFont
import PIL.ImageOps
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.nodetool.image.enhance import (
    adaptive_contrast,
    canny_edge_detection,
)
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
from typing import Literal


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


class Invert(BaseNode):
    """
    The Invert Node is a filter node that inverts the colors of an image.

    This node is specifically designed to perform a color inversion operation on an image. In simple terms, it changes every color in the image to its exact opposite color on the color wheel, creating a kind of 'negative' of the original image. It's a commonly used filter in image editing and can give unique and interesting results.

    #### Applications
    - Creating 'negative' versions of images for visual effect or artistic purposes.
    - Analyzing image data by bringing out details that might be overlooked in the original image.
    - Preprocessing images for further operations that work better on inverted images.
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to adjust the brightness for."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageOps.invert(image)
        return await context.image_from_pil(res)


class Solarize(BaseNode):
    """
    The Solarize Node is a filter node that applies a special solarize effect to an image.

    This solarization effect involves reversing the tones of an image, either wholly or partially. It is an artistic technique widely used in photography, which creates a distinctive and eye-catching visual style. The Solarize Node lets you define a threshold, this threshold determines which tones in the image to reverse.

    #### Applications
    - Creating artistic photo effects: Solarization can produce surreal and abstract images from ordinary photographs.
    - Enhancing visual data: Solarization can be used to make certain elements within an image more prominent.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to solarize.")
    threshold: int = Field(
        default=128, ge=0, le=255, description="Threshold for solarization."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageOps.solarize(image, threshold=self.threshold)
        return await context.image_from_pil(res)


class Posterize(BaseNode):
    """
    The Posterize Node is used for applying a "posterization" effect to an image.

    In short, it simplifies an image's colors by reducing the number of bits per color channel, resulting in a "poster-like" appearance, often used in graphic art and illustration. It could bring a unique, artistic style to your images and emphasize certain elements within the image.

    #### Applications
    - Graphic Design: Create graphic art by posterizing an image and adding additional design elements.
    - Photography: Apply artistic effects to photographs to emphasize certain aspects or to change the image's mood.
    - Advertising: Create compelling visual content for advertisement and promotional campaigns by posterizing images.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to posterize.")
    bits: int = Field(
        default=4, ge=1, le=8, description="Number of bits to posterize to."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageOps.posterize(image, bits=self.bits)
        return await context.image_from_pil(res)


class Fit(BaseNode):
    """
    The FitNode is a workflow component that resizes an image to fit within a specified size.

    The FitNode is a vital tool in image processing workflows. It takes as input an image and a desired size (width and height) and adjusts the dimensions of the image while maintaining its aspect ratio. This tool ensures that your images fit perfectly into predefined spaces, keeping the integrity and quality of the image content intact.

    #### Applications
    - Image resizing for online publishing: FitNode ensures your images meet the dimension requirements of different platforms.
    - Preprocessing for machine learning: Uniform image sizes can aid in the efficiency and accuracy of your algorithms.
    - Web development: Use FitNode to control and adjust image display sizes on your website.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to fit.")
    width: int = Field(default=512, ge=1, le=4096, description="Width to fit to.")
    height: int = Field(default=512, ge=1, le=4096, description="Height to fit to.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageOps.fit(image, (self.width, self.height), PIL.Image.LANCZOS)
        return await context.image_from_pil(res)


class Expand(BaseNode):
    """
    This node expands images, by adding a border around them.

    This Expand Node is used to increase the size of an image by adding a specific border size and color. This helps users to differentiate the main content of an image from its surroundings.

    #### Applications
    - Separating images from surrounding content: You can add a colored border around an image to make it stand out from its environment.
    - Image framing: The bordered image can serve as a framed photo, making it more appealing.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to expand.")
    border: int = Field(default=0, ge=0, le=512, description="Border size.")
    fill: int = Field(default=0, ge=0, le=255, description="Fill color.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageOps.expand(image, border=self.border, fill=self.fill)
        return await context.image_from_pil(res)


class Blur(BaseNode):
    """
    The Blur Node is used to apply a blur effect to an image.

    The purpose of this node is to allow users to modify an image by adding a blur effect, allowing the degree of blur to be precisely controlled. By customizing the blur radius, users can adjust the intensity of the blur effect.

    #### Applications
    - Image editing: Soften an image or reduce image noise and detail.
    - Focus manipulation: Make certain areas of an image stand out by blurring the surrounding areas.
    - Privacy protection: Blur sensitive information in an image.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to blur.")
    radius: float = Field(default=2.0, ge=0.0, le=10.0, description="Blur radius.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = image.filter(PIL.ImageFilter.GaussianBlur(self.radius))
        return await context.image_from_pil(res)


class Contour(BaseNode):
    """
    This node is essentially an image contour filter.

    The Contour Node manipulates an input image by applying a contour filter. This node is designed to highlight the edges in an image, thus producing an outline or contour sketch of the image. It's particularly handy when one needs to identify the broad features of a complex image.

    #### Applications
    - Image Processing: It can be used to extract and highlight the necessary features from an image and avoid unnecessary details.
    - Pattern Recognition: It can be used to identify shapes or patterns in images, aiding in computer vision tasks such as object recognition or tracking.
    - Artistic Effects: It can be used to convert standard images to stylized versions, mimicking contour sketch arts.

    #### Example
    In a machine vision workflow, use this node to convert input images into their contour sketches. Then these sketches can be connected to other nodes, for instance, a node detecting specific shapes on those images.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to contour.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.CONTOUR))


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


class Emboss(BaseNode):
    """
    The Emboss Node applies an embossing effect to an image.

    The purpose of this node is to transform any given image by applying an emboss filter which achieves a three-dimensional look, as if the image objects are raised above the background. Embossing adds texture and depth to the image making it more visually stimulating.

    #### Applications
    - Photo Editing: Use this node to apply artistic effects on photos.
    - Graphic Design: Apply emboss filter to create visually interesting graphics.
    - Digital Art: Incorporate in digital artwork for a unique textured effect.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to emboss.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.EMBOSS))


class FindEdges(BaseNode):
    """
    This node is a "Find Edges" filter. It identifies edges within an image.

    The purpose of this node is to highlight areas in an image where significant changes in color or intensity occur, which are often perceived as edges or boundaries. Using this, you can have a clearer understanding of the structural patterns in your image.

    #### Applications
    - **Image Analysis:** Can be used to analyze and interpret the structures within an image.
    - **Computer Vision:** Helpful in object detection and recognition tasks, where edge information is crucial.
    - **Feature Detection:** Used to detect important image features such as corners, ridges, or blobs.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to find edges.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.FIND_EDGES))


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


class Smooth(BaseNode):
    """
    Smooth Node is a computational function designed to smooth images.

    The node takes an image as input, applies a smooth filter, and returns the smoothed image as the output. The smoothing process aids in reducing image noise and detail, providing a visually pleasing image. It's a vital step in many image processing tasks such as object detection, facial recognition, and feature extraction.

    #### Applications
    - Image Editing: You can use Smooth Node to smoothen your images for a better visual aesthetics.
    - Object Detection: It can help diminish irrelevant image details, thus improving object detection process.
    - Facial Recognition: The smooth filter can reduce the complexity of the image, making facial recognition more accurate.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to smooth.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.filter(PIL.ImageFilter.SMOOTH))


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


class Canny(BaseNode):
    """
    The Canny Node applies the Canny filter to an image.

    The Canny filter, named after its developer John F. Canny, is primarily used for edge detection in an image. Edge detection is the process of identifying points in an image where sharp color changes occur, which often correspond to object boundaries. The Canny filter is recognised for its superior edge detection due to its use of a multi-stage algorithm.

    #### Applications
    - Detect the edges in photos and pictures to visually highlight areas with rapid intensity changes.
    - Improve image understanding by outlining the boundaries and structure of the objects in the image.
    - Enhance machine learning models for tasks like object detection, image recognition and segmentation.

    #### Example
    To build a workflow, one might connect a 'Load Image' node to the Canny Node. The image to be processed will be loaded from the 'Load Image' node and then passed on to the Canny Node. Once the Canny filter is applied, the resulting image with the highlighted edges can be displayed using a 'Show Image' node.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to canny.")
    low_threshold: int = Field(default=100, ge=0, le=255, description="Low threshold.")
    high_threshold: int = Field(
        default=200, ge=0, le=255, description="High threshold."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = canny_edge_detection(image, self.low_threshold, self.high_threshold)
        return await context.image_from_pil(res)


class Scale(BaseNode):
    """
    The Scale Node let's you enlarge or shrink an image.

    This node adjusts an image to a size that is a given factor times larger or smaller than the original. Useful when preparing images for display or analysis, it ensures a suitable size while maintaining the original aspect ratio.

    #### Applications
    - Image processing: Use this node to adjust the dimensions of images in a photo gallery.
    - Data preprocessing: In machine learning, this node can standardize images to a consistent size before feeding them to an algorithm.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to scale.")
    scale: float = Field(default=1.0, ge=0.0, le=10.0, description="The scale factor.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        width = int((image.width * self.scale))
        height = int((image.height * self.scale))
        image = image.resize((width, height), PIL.Image.Resampling.LANCZOS)
        return await context.image_from_pil(image)


class Resize(BaseNode):
    """
    The Resize Node is a tool that modifies the size of an image.

    The purpose of this node is to change the width and height of an image to desired dimensions. The notable feature of this node is the use of the high-quality PIL.Image.LANCZOS filter for resizing, which helps in maintaining the quality of the image.

    #### Applications
    - Preprocessing images for machine learning models: Changing the size of images to fit the input size requirement of the model.
    - Image optimization for the web: Reducing the size of an image to improve the load time of a webpage.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to resize.")
    width: int = Field(default=512, ge=0, le=4096, description="The target width.")
    height: int = Field(default=512, ge=0, le=4096, description="The target height.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = image.resize((self.width, self.height), PIL.Image.LANCZOS)
        return await context.image_from_pil(res)


class Crop(BaseNode):
    """
    The Crop Node is used to trim an image.

    This node is specifically designed to crop or cut out a section of an image based on specified coordinates. You can indicate the left, top, right, and bottom boundaries for the crop. This becomes useful when you need to focus on a specific area of an image or remove unwanted sections.

    #### Applications
    - Cropping out unwanted image borders.
    - Focus on a particular subject within an image.
    - Remove distractions from an image to simplify it.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to crop.")
    left: int = Field(default=0, ge=0, le=4096, description="The left coordinate.")
    top: int = Field(default=0, ge=0, le=4096, description="The top coordinate.")
    right: int = Field(default=512, ge=0, le=4096, description="The right coordinate.")
    bottom: int = Field(
        default=512, ge=0, le=4096, description="The bottom coordinate."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = image.crop((self.left, self.top, self.right, self.bottom))
        return await context.image_from_pil(res)


class ConvertToGrayscale(BaseNode):
    """
    This node converts an image to grayscale.

    The Convert to Grayscale Node is used to transform a colored image into shades of grey. The purpose of this node is to simplify the image contents, highlighting the contrasts and shapes in the image, instead of colors.

    #### Applications
    - **Image processing**: Altering the color of an image into grayscale often helps in different image processing tasks like feature detection and edge detection.
    - **Machine learning**: Grayscale images simplify machine learning tasks by focusing on shape recognition rather than color.
    - **Design and Art**: Grayscale conversion is often used in design and art to give a vintage or monochrome aesthetic to images.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to convert.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        return await context.image_from_pil(image.convert("L"))


class GetChannel(BaseNode):
    """
    This node is useful for extracting a specific color channel from an image.

    The Get Channel Node is purposed for fetching a particular color channel ('red', 'green', or 'blue') from an input image. This node enables isolating the user-specified colour information, which is significant in different image processing scenarios such as enhancing image visibility, filtering colors, and improving image analyses.

    #### Applications
    - **Image Analysis**: Extracting color channels can be useful in scenarios where particular color information is needed for image analysis.
    - **Graphic Design**: Graphic designers can use this node to isolate and manipulate specific color components in an image.
    - **Image Enhancements**: By isolating a certain color channel, one can enhance or decrease the visibility of certain color components in an image.
    """

    class ChannelEnum(str, Enum):
        RED = "R"
        GREEN = "G"
        BLUE = "B"

    image: ImageRef = Field(
        default=ImageRef(), description="The image to get the channel from."
    )
    channel: ChannelEnum = ChannelEnum.RED

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = image.getchannel(self.channel.value)
        return await context.image_from_pil(res)
