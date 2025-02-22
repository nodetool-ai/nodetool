from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Blur(GraphNode):
    """
    Apply a Gaussian blur effect to an image.
    image, filter, blur

    - Soften images or reduce noise and detail
    - Make focal areas stand out by blurring surroundings
    - Protect privacy by blurring sensitive information
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to blur.')
    radius: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Blur radius.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.Blur"



class Canny(GraphNode):
    """
    Apply Canny edge detection to an image.
    image, filter, edges

    - Highlight areas of rapid intensity change
    - Outline object boundaries and structure
    - Enhance inputs for object detection and image segmentation
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to canny.')
    low_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Low threshold.')
    high_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=200, description='High threshold.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.Canny"



class Contour(GraphNode):
    """
    Apply a contour filter to highlight image edges.
    image, filter, contour

    - Extract key features from complex images
    - Aid pattern recognition and object detection
    - Create stylized contour sketch art effects
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to contour.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.Contour"



class ConvertToGrayscale(GraphNode):
    """
    Convert an image to grayscale.
    image, grayscale

    - Simplify images for feature and edge detection
    - Prepare images for shape-based machine learning
    - Create vintage or monochrome aesthetic effects
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to convert.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.ConvertToGrayscale"



class Emboss(GraphNode):
    """
    Apply an emboss filter for a 3D raised effect.
    image, filter, emboss

    - Add texture and depth to photos
    - Create visually interesting graphics
    - Incorporate unique effects in digital artwork
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to emboss.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.Emboss"



class Expand(GraphNode):
    """
    Add a border around an image to increase its size.
    image, border, expand

    - Make images stand out by adding a colored border
    - Create framed photo effects
    - Separate image content from surroundings
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to expand.')
    border: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Border size.')
    fill: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Fill color.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.Expand"



class FindEdges(GraphNode):
    """
    Detect and highlight edges in an image.
    image, filter, edges

    - Analyze structural patterns in images
    - Aid object detection in computer vision
    - Detect important features like corners and ridges
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to find edges.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.FindEdges"


import nodetool.nodes.lib.image.pillow.filter

class GetChannel(GraphNode):
    """
    Extract a specific color channel from an image.
    image, color, channel, isolate, extract

    - Isolate color information for image analysis
    - Manipulate specific color components in graphic design
    - Enhance or reduce visibility of certain colors
    """

    ChannelEnum: typing.ClassVar[type] = nodetool.nodes.lib.image.pillow.filter.GetChannel.ChannelEnum
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to get the channel from.')
    channel: nodetool.nodes.lib.image.pillow.filter.GetChannel.ChannelEnum = Field(default=ChannelEnum.RED, description=None)

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.GetChannel"



class Invert(GraphNode):
    """
    Invert the colors of an image.
    image, filter, invert

    - Create negative versions of images for visual effects
    - Analyze image data by bringing out hidden details
    - Preprocess images for operations that work better on inverted colors
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to adjust the brightness for.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.Invert"



class Posterize(GraphNode):
    """
    Reduce the number of colors in an image for a poster-like effect.
    image, filter, posterize

    - Create graphic art by simplifying image colors
    - Apply artistic effects to photographs
    - Generate visually compelling content for advertising
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to posterize.')
    bits: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='Number of bits to posterize to.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.Posterize"



class Smooth(GraphNode):
    """
    Apply smoothing to reduce image noise and detail.
    image, filter, smooth

    - Enhance visual aesthetics of images
    - Improve object detection by reducing irrelevant details
    - Aid facial recognition by simplifying images
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to smooth.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.Smooth"



class Solarize(GraphNode):
    """
    Apply a solarize effect to partially invert image tones.
    image, filter, solarize

    - Create surreal artistic photo effects
    - Enhance visual data by making certain elements more prominent
    - Add a unique style to images for graphic design
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to solarize.')
    threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=128, description='Threshold for solarization.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.filter.Solarize"


