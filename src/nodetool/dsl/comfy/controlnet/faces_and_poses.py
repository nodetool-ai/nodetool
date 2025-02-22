from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.comfy.controlnet.faces_and_poses
import nodetool.nodes.comfy.controlnet.faces_and_poses
import nodetool.nodes.comfy.controlnet.faces_and_poses
import nodetool.nodes.comfy.controlnet.faces_and_poses
import nodetool.nodes.comfy.controlnet.faces_and_poses

class DWPose_Preprocessor(GraphNode):
    """
    Estimates poses from an image.
    controlnet, faces_and_poses, dw_pose
    """

    Toggle: typing.ClassVar[type] = nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle
    Toggle: typing.ClassVar[type] = nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle
    Toggle: typing.ClassVar[type] = nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle
    BBoxDetectorModel: typing.ClassVar[type] = nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.BBoxDetectorModel
    PoseEstimatorModel: typing.ClassVar[type] = nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.PoseEstimatorModel
    detect_hand: nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle = Field(default=Toggle.ENABLE, description='Toggle to enable or disable hand detection.')
    detect_body: nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle = Field(default=Toggle.ENABLE, description='Toggle to enable or disable body detection.')
    detect_face: nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle = Field(default=Toggle.ENABLE, description='Toggle to enable or disable face detection.')
    bbox_detector: nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.BBoxDetectorModel = Field(default=BBoxDetectorModel.YOLOX_L_TORCHSCRIPT_PT, description='The bounding box detector model to use.')
    pose_estimator: nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.PoseEstimatorModel = Field(default=PoseEstimatorModel.DW_LL_UCOCO_384_BS5_TORCHSCRIPT_PT, description='The pose estimator model to use.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.faces_and_poses.DWPose_Preprocessor"


import nodetool.nodes.comfy.comfy_node
import nodetool.nodes.comfy.controlnet.faces_and_poses

class DensePosePreprocessor(GraphNode):
    """
    Estimates dense poses from an image.
    controlnet, faces_and_poses, densepose
    """

    DensePoseModel: typing.ClassVar[type] = nodetool.nodes.comfy.comfy_node.DensePosePreprocessor.DensePoseModel
    DensePoseCMap: typing.ClassVar[type] = nodetool.nodes.comfy.controlnet.faces_and_poses.DensePosePreprocessor.DensePoseCMap
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    model: nodetool.nodes.comfy.comfy_node.DensePosePreprocessor.DensePoseModel = Field(default=DensePoseModel.DENSEPOSE_R50_FPN_DL, description='The model to use.')
    cmap: nodetool.nodes.comfy.controlnet.faces_and_poses.DensePosePreprocessor.DensePoseCMap = Field(default=DensePoseCMap.VIRIDIS, description='The color map to use.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.faces_and_poses.DensePosePreprocessor"


import nodetool.nodes.comfy.comfy_node
import nodetool.nodes.comfy.comfy_node
import nodetool.nodes.comfy.comfy_node

class OpenposePreprocessor(GraphNode):
    """
    Estimates poses from an image.
    controlnet, faces_and_poses, openpose
    """

    EnableDisable: typing.ClassVar[type] = nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable
    EnableDisable: typing.ClassVar[type] = nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable
    EnableDisable: typing.ClassVar[type] = nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    detect_hand: nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable = Field(default=EnableDisable.ENABLE, description='Whether to detect hands.')
    detect_body: nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable = Field(default=EnableDisable.ENABLE, description='Whether to detect bodies.')
    detect_face: nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable = Field(default=EnableDisable.ENABLE, description='Whether to detect faces.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.faces_and_poses.OpenposePreprocessor"


