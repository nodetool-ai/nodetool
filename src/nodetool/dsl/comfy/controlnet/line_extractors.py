from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AnimeLineArtPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.AnimeLineArtPreprocessor"



class AnyLinePreprocessor(GraphNode):
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
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    low_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='The low threshold to use.')
    high_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=200, description='The high threshold to use.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.CannyEdgePreprocessor"


from nodetool.nodes.comfy.controlnet.line_extractors import DiffusionEdge_Preprocessor_Environment

class DiffusionEdge_Preprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    environment: DiffusionEdge_Preprocessor_Environment | GraphNode | tuple[GraphNode, str] = Field(default=DiffusionEdge_Preprocessor_Environment('indoor'), description='The environment to use.')
    patch_batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='The patch batch size to use.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.DiffusionEdge_Preprocessor"


from nodetool.nodes.comfy.controlnet.line_extractors import SafeMode

class HEDPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    safe: SafeMode | GraphNode | tuple[GraphNode, str] = Field(default=SafeMode('enable'), description='Whether to use safe mode.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.HEDPreprocessor"


from nodetool.common.comfy_node import EnableDisable

class LineartPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    coarse: EnableDisable | GraphNode | tuple[GraphNode, str] = Field(default=EnableDisable('disable'), description='Whether to use coarse lineart.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.LineartPreprocessor"



class LineartStandardPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    guassian_sigma: float | GraphNode | tuple[GraphNode, str] = Field(default=6.0, description='The Gaussian sigma value for preprocessing.')
    intensity_threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='The intensity threshold value for preprocessing.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.LineartStandardPreprocessor"



class Manga2Anime_LineArt_Preprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.Manga2Anime_LineArt_Preprocessor"


from nodetool.common.comfy_node import EnableDisable

class PiDiNetPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    safe: EnableDisable | GraphNode | tuple[GraphNode, str] = Field(default=EnableDisable('enable'), description=None)
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.PiDiNetPreprocessor"



class ScribblePreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.ScribblePreprocessor"



class ScribbleXDoGPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=32, description=None)
    @classmethod
    def get_node_type(cls): return "comfy.controlnet.line_extractors.ScribbleXDoGPreprocessor"


