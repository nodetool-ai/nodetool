from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AnimeLineArtPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.line_extractors.AnimeLineArtPreprocessor"


class BinaryPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    bin_threshold: int | GraphNode | tuple[GraphNode, str] = Field(
        default=100, description="The threshold for the binary image."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.line_extractors.BinaryPreprocessor"


class CannyEdgePreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    low_threshold: int | GraphNode | tuple[GraphNode, str] = Field(
        default=100, description="The low threshold to use."
    )
    high_threshold: int | GraphNode | tuple[GraphNode, str] = Field(
        default=200, description="The high threshold to use."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.line_extractors.CannyEdgePreprocessor"


from nodetool.nodes.comfy.controlnet.line_extractors import SafeMode


class HEDPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    safe: SafeMode | GraphNode | tuple[GraphNode, str] = Field(
        default=SafeMode("enable"), description="Whether to use safe mode."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.line_extractors.HEDPreprocessor"


from nodetool.common.comfy_node import EnableDisable


class LineartPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    coarse: EnableDisable | GraphNode | tuple[GraphNode, str] = Field(
        default=EnableDisable("disable"), description="Whether to use coarse lineart."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.line_extractors.LineartPreprocessor"


class LineartStandardPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    guassian_sigma: float | GraphNode | tuple[GraphNode, str] = Field(
        default=6.0, description="The Gaussian sigma value for preprocessing."
    )
    intensity_threshold: int | GraphNode | tuple[GraphNode, str] = Field(
        default=8, description="The intensity threshold value for preprocessing."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.line_extractors.LineartStandardPreprocessor"


class Manga2Anime_LineArt_Preprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.line_extractors.Manga2Anime_LineArt_Preprocessor"


from nodetool.common.comfy_node import EnableDisable


class PiDiNetPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    safe: EnableDisable | GraphNode | tuple[GraphNode, str] = Field(
        default=EnableDisable("enable"), description=None
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.line_extractors.PiDiNetPreprocessor"


class PreprocessImage(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.PreprocessImage"


class ScribblePreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.line_extractors.ScribblePreprocessor"


class ScribbleXDoGPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    threshold: float | GraphNode | tuple[GraphNode, str] = Field(
        default=32, description=None
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.line_extractors.ScribbleXDoGPreprocessor"
