from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AnimeLineArtPreprocessor(GraphNode):
    """
    Preprocesses an image for anime lineart.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.AnimeLineArtPreprocessor"



class AnyLinePreprocessor(GraphNode):
    """
    Preprocesses an image for any lineart.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    merge_with_lineart: str | GraphNode | tuple[GraphNode, str] = Field(default='lineart_standard', description='The lineart to merge with.')
    lineart_lower_bound: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The lower bound for lineart.')
    lineart_upper_bound: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The upper bound for lineart.')
    object_min_size: int | GraphNode | tuple[GraphNode, str] = Field(default=36, description='The minimum size for objects.')
    object_connectivity: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The connectivity for objects.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.AnyLinePreprocessor"



class BinaryPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    bin_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='The threshold for the binary image.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.BinaryPreprocessor"



class CannyEdgePreprocessor(GraphNode):
    """
    Preprocesses an image for canny edge detection.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    low_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='The low threshold to use.')
    high_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=200, description='The high threshold to use.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.CannyEdgePreprocessor"


import nodetool.nodes.comfy.controlnet.line_extractors

class DiffusionEdge_Preprocessor(GraphNode):
    """
    Preprocesses an image for diffusion edge detection.
    """

    DiffusionEdge_Preprocessor_Environment: typing.ClassVar[type] = nodetool.nodes.comfy.controlnet.line_extractors.DiffusionEdge_Preprocessor.DiffusionEdge_Preprocessor_Environment
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    environment: nodetool.nodes.comfy.controlnet.line_extractors.DiffusionEdge_Preprocessor.DiffusionEdge_Preprocessor_Environment = Field(default=DiffusionEdge_Preprocessor_Environment.INDOOR, description='The environment to use.')
    patch_batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='The patch batch size to use.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.DiffusionEdge_Preprocessor"


import nodetool.nodes.comfy.controlnet.line_extractors

class HEDPreprocessor(GraphNode):
    """
    Preprocesses an image for HED lineart.
    """

    SafeMode: typing.ClassVar[type] = nodetool.nodes.comfy.controlnet.line_extractors.HEDPreprocessor.SafeMode
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    safe: nodetool.nodes.comfy.controlnet.line_extractors.HEDPreprocessor.SafeMode = Field(default=SafeMode.enable, description='Whether to use safe mode.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.HEDPreprocessor"


import nodetool.nodes.comfy.comfy_node

class LineartPreprocessor(GraphNode):
    EnableDisable: typing.ClassVar[type] = nodetool.nodes.comfy.comfy_node.LineartPreprocessor.EnableDisable
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    coarse: nodetool.nodes.comfy.comfy_node.LineartPreprocessor.EnableDisable = Field(default=EnableDisable.DISABLE, description='Whether to use coarse lineart.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.LineartPreprocessor"



class LineartStandardPreprocessor(GraphNode):
    """
    Preprocesses an image for standard lineart.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    guassian_sigma: float | GraphNode | tuple[GraphNode, str] = Field(default=6.0, description='The Gaussian sigma value for preprocessing.')
    intensity_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='The intensity threshold value for preprocessing.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.LineartStandardPreprocessor"



class Manga2Anime_LineArt_Preprocessor(GraphNode):
    """
    Preprocesses an image for manga to anime lineart.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.Manga2Anime_LineArt_Preprocessor"


import nodetool.nodes.comfy.comfy_node

class PiDiNetPreprocessor(GraphNode):
    """
    Preprocesses an image for PiDiNet lineart.
    """

    EnableDisable: typing.ClassVar[type] = nodetool.nodes.comfy.comfy_node.PiDiNetPreprocessor.EnableDisable
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    safe: nodetool.nodes.comfy.comfy_node.PiDiNetPreprocessor.EnableDisable = Field(default=EnableDisable.ENABLE, description=None)

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.PiDiNetPreprocessor"



class ScribblePreprocessor(GraphNode):
    """
    Preprocesses an image for scribble lineart.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.ScribblePreprocessor"



class ScribbleXDoGPreprocessor(GraphNode):
    """
    Preprocesses an image for scribble lineart.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=32, description=None)

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.ScribbleXDoGPreprocessor"


