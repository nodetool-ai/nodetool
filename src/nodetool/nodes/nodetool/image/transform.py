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
    canny_edge_detection,
)
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
from typing import Literal


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
