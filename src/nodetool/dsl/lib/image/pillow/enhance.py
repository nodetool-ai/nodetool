from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AdaptiveContrast(GraphNode):
    """
    Applies localized contrast enhancement using adaptive techniques.
    image, contrast, enhance

    Use cases:
    - Improve visibility in images with varying lighting conditions
    - Prepare images for improved feature detection in computer vision
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to adjust the contrast for.')
    clip_limit: float | GraphNode | tuple[GraphNode, str] = Field(default=2.0, description='Clip limit for adaptive contrast.')
    grid_size: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Grid size for adaptive contrast.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.AdaptiveContrast"



class AutoContrast(GraphNode):
    """
    Automatically adjusts image contrast for enhanced visual quality.
    image, contrast, balance

    Use cases:
    - Enhance image clarity for better visual perception
    - Pre-process images for computer vision tasks
    - Improve photo aesthetics in editing workflows
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to adjust the contrast for.')
    cutoff: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Represents the percentage of pixels to ignore at both the darkest and lightest ends of the histogram. A cutoff value of 5 means ignoring the darkest 5% and the lightest 5% of pixels, enhancing overall contrast by stretching the remaining pixel values across the full brightness range.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.AutoContrast"



class Brightness(GraphNode):
    """
    Adjusts overall image brightness to lighten or darken.
    image, brightness, enhance

    Use cases:
    - Correct underexposed or overexposed photographs
    - Enhance visibility of dark image regions
    - Prepare images for consistent display across devices
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to adjust the brightness for.')
    factor: float | int | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the brightness. 1.0 means no change.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.Brightness"



class Color(GraphNode):
    """
    Adjusts color intensity of an image.
    image, color, enhance

    Use cases:
    - Enhance color vibrancy in photographs
    - Correct color imbalances in digital images
    - Prepare images for consistent brand color representation
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to adjust the brightness for.')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the contrast. 1.0 means no change.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.Color"



class Contrast(GraphNode):
    """
    Adjusts image contrast to modify light-dark differences.
    image, contrast, enhance

    Use cases:
    - Enhance visibility of details in low-contrast images
    - Prepare images for visual analysis or recognition tasks
    - Create dramatic effects in artistic photography
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to adjust the brightness for.')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the contrast. 1.0 means no change.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.Contrast"



class Detail(GraphNode):
    """
    Enhances fine details in images.
    image, detail, enhance

    Use cases:
    - Improve clarity of textural elements in photographs
    - Enhance visibility of small features for analysis
    - Prepare images for high-resolution display or printing
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to detail.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.Detail"



class EdgeEnhance(GraphNode):
    """
    Enhances edge visibility by increasing contrast along boundaries.
    image, edge, enhance

    Use cases:
    - Improve object boundary detection for computer vision
    - Highlight structural elements in technical drawings
    - Prepare images for feature extraction in image analysis
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to edge enhance.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.EdgeEnhance"



class Equalize(GraphNode):
    """
    Enhances image contrast by equalizing intensity distribution.
    image, contrast, histogram

    Use cases:
    - Improve visibility in poorly lit images
    - Enhance details for image analysis tasks
    - Normalize image data for machine learning
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to equalize.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.Equalize"



class RankFilter(GraphNode):
    """
    Applies rank-based filtering to enhance or smooth image features.
    image, filter, enhance

    Use cases:
    - Reduce noise while preserving edges in images
    - Enhance specific image features based on local intensity
    - Pre-process images for improved segmentation results
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to rank filter.')
    size: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Rank filter size.')
    rank: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Rank filter rank.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.RankFilter"



class Sharpen(GraphNode):
    """
    Enhances image detail by intensifying local pixel contrast.
    image, sharpen, clarity

    Use cases:
    - Improve clarity of photographs for print or display
    - Refine texture details in product photography
    - Enhance readability of text in document images
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to sharpen.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.Sharpen"



class Sharpness(GraphNode):
    """
    Adjusts image sharpness to enhance or reduce detail clarity.
    image, clarity, sharpness

    Use cases:
    - Enhance photo details for improved visual appeal
    - Refine images for object detection tasks
    - Correct slightly blurred images
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to adjust the brightness for.')
    factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to adjust the contrast. 1.0 means no change.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.Sharpness"



class UnsharpMask(GraphNode):
    """
    Sharpens images using the unsharp mask technique.
    image, sharpen, enhance

    Use cases:
    - Enhance edge definition in photographs
    - Improve perceived sharpness of digital artwork
    - Prepare images for high-quality printing or display
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to unsharp mask.')
    radius: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Unsharp mask radius.')
    percent: int | GraphNode | tuple[GraphNode, str] = Field(default=150, description='Unsharp mask percent.')
    threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Unsharp mask threshold.')

    @classmethod
    def get_node_type(cls): return "lib.image.pillow.enhance.UnsharpMask"


