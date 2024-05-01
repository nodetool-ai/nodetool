from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class BAE_Normal_Map_Preprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.normal_and_depth.BAE_Normal_Map_Preprocessor"


class InpaintPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to inpaint.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(
        default=Mask(type="comfy.mask"), description="The mask to use for inpainting."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.normal_and_depth.InpaintPreprocessor"


from nodetool.common.comfy_node import EnableDisable


class LeReSDepthMapPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    rm_nearest: float | GraphNode | tuple[GraphNode, str] = Field(
        default=0.0, description="The nearest depth to remove."
    )
    rm_background: float | GraphNode | tuple[GraphNode, str] = Field(
        default=0.0, description="The background depth to remove."
    )
    boost: EnableDisable | GraphNode | tuple[GraphNode, str] = Field(
        default=EnableDisable("disable"), description="Whether to boost the depth map."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.normal_and_depth.LeReSDepthMapPreprocessor"


class MIDASDepthMapPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    a: float | GraphNode | tuple[GraphNode, str] = Field(
        default=6.283185307179586,
        description="Parameter 'a' for the MIDAS Depth Map Preprocessor.",
    )
    bg_threshold: float | GraphNode | tuple[GraphNode, str] = Field(
        default=0.1,
        description="Background threshold for the MIDAS Depth Map Preprocessor.",
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.normal_and_depth.MIDASDepthMapPreprocessor"


class MIDASNormalMapPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    a: float | GraphNode | tuple[GraphNode, str] = Field(
        default=6.283185307179586,
        description="Parameter 'a' for the MIDAS Normal Map Preprocessor.",
    )
    bg_threshold: float | GraphNode | tuple[GraphNode, str] = Field(
        default=0.1,
        description="Background threshold for the MIDAS Normal Map Preprocessor.",
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.normal_and_depth.MIDASNormalMapPreprocessor"


class MeshGraphormerDepthMapPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    mask_bbox_padding: int | GraphNode | tuple[GraphNode, str] = Field(
        default=30, description="The padding for the mask bounding box."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.normal_and_depth.MeshGraphormerDepthMapPreprocessor"


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


class ZoeDepthMapPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.normal_and_depth.ZoeDepthMapPreprocessor"
