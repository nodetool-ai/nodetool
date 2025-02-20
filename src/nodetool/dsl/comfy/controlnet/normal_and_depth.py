from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class BAE_Normal_Map_Preprocessor(GraphNode):
    """
    BAE normal map detection preprocessor.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.normal_and_depth.BAE_Normal_Map_Preprocessor"



class DSINE_Normal_Map_Preprocessor(GraphNode):
    """
    DSINE normal map preprocessor.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    fov: float | GraphNode | tuple[GraphNode, str] = Field(default=60.0, description='The field of view to use.')
    iterations: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='The number of iterations to use.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.normal_and_depth.DSINE_Normal_Map_Preprocessor"


import nodetool.nodes.comfy.controlnet.normal_and_depth

class DepthAnythingV2Preprocessor(GraphNode):
    """
    Depth Anything V2 preprocessor.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    ckpt_name: nodetool.nodes.comfy.controlnet.normal_and_depth.DepthAnythingV2Preprocessor.DepthAnythingModel = Field(default=nodetool.nodes.comfy.controlnet.normal_and_depth.DepthAnythingV2Preprocessor.DepthAnythingModel('depth_anything_v2_vits.pth'), description='The checkpoint name to use.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.normal_and_depth.DepthAnythingV2Preprocessor"



class InpaintPreprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to inpaint.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask to use for inpainting.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.normal_and_depth.InpaintPreprocessor"


import nodetool.nodes.comfy.comfy_node

class LeReSDepthMapPreprocessor(GraphNode):
    """
    Preprocesses an image for LeReS depth map detection.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    rm_nearest: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The nearest depth to remove.')
    rm_background: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The background depth to remove.')
    boost: nodetool.nodes.comfy.comfy_node.LeReSDepthMapPreprocessor.EnableDisable = Field(default=nodetool.nodes.comfy.comfy_node.LeReSDepthMapPreprocessor.EnableDisable('disable'), description='Whether to boost the depth map.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.normal_and_depth.LeReSDepthMapPreprocessor"



class MIDASDepthMapPreprocessor(GraphNode):
    """
    MIDAS depth map detection preprocessor.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    a: float | GraphNode | tuple[GraphNode, str] = Field(default=6.283185307179586, description="Parameter 'a' for the MIDAS Depth Map Preprocessor.")
    bg_threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Background threshold for the MIDAS Depth Map Preprocessor.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.normal_and_depth.MIDASDepthMapPreprocessor"



class MIDASNormalMapPreprocessor(GraphNode):
    """
    Preprocesses an image for MIDAS normal map detection.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    a: float | GraphNode | tuple[GraphNode, str] = Field(default=6.283185307179586, description="Parameter 'a' for the MIDAS Normal Map Preprocessor.")
    bg_threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Background threshold for the MIDAS Normal Map Preprocessor.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.normal_and_depth.MIDASNormalMapPreprocessor"


import nodetool.nodes.comfy.controlnet.normal_and_depth

class Metric3D_Depth_Map_Preprocessor(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    backbone: nodetool.nodes.comfy.controlnet.normal_and_depth.Metric3D_Depth_Map_Preprocessor.Metric3D_Depth_Map_Backbone = Field(default=nodetool.nodes.comfy.controlnet.normal_and_depth.Metric3D_Depth_Map_Preprocessor.Metric3D_Depth_Map_Backbone('vit-small'), description='The backbone to use.')
    fx: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description='The fx to use.')
    fy: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description='The fy to use.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.normal_and_depth.Metric3D_Depth_Map_Preprocessor"



class ZoeDepthMapPreprocessor(GraphNode):
    """
    Zoe depth map detection preprocessor.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.normal_and_depth.ZoeDepthMapPreprocessor"


import nodetool.nodes.comfy.controlnet.normal_and_depth

class Zoe_DepthAnythingPreprocessor(GraphNode):
    """
    Zoe depth anything preprocessor.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    environment: nodetool.nodes.comfy.controlnet.normal_and_depth.Zoe_DepthAnythingPreprocessor.ZoeDepthAnythingEnvironment = Field(default=nodetool.nodes.comfy.controlnet.normal_and_depth.Zoe_DepthAnythingPreprocessor.ZoeDepthAnythingEnvironment('indoor'), description='The environment to use.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.normal_and_depth.Zoe_DepthAnythingPreprocessor"


