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

    detect_hand: nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle = Field(default=nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle('enable'), description='Toggle to enable or disable hand detection.')
    detect_body: nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle = Field(default=nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle('enable'), description='Toggle to enable or disable body detection.')
    detect_face: nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle = Field(default=nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.Toggle('enable'), description='Toggle to enable or disable face detection.')
    bbox_detector: nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.BBoxDetectorModel = Field(default=nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.BBoxDetectorModel('yolox_l.torchscript.pt'), description='The bounding box detector model to use.')
    pose_estimator: nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.PoseEstimatorModel = Field(default=nodetool.nodes.comfy.controlnet.faces_and_poses.DWPose_Preprocessor.PoseEstimatorModel('dw-ll_ucoco_384_bs5.torchscript.pt'), description='The pose estimator model to use.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.faces_and_poses.DWPose_Preprocessor"


import nodetool.nodes.comfy.comfy_node
import nodetool.nodes.comfy.controlnet.faces_and_poses

class DensePosePreprocessor(GraphNode):
    """
    Estimates dense poses from an image.
    controlnet, faces_and_poses, densepose
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    model: nodetool.nodes.comfy.comfy_node.DensePosePreprocessor.DensePoseModel = Field(default=nodetool.nodes.comfy.comfy_node.DensePosePreprocessor.DensePoseModel('densepose_r50_fpn_dl.torchscript'), description='The model to use.')
    cmap: nodetool.nodes.comfy.controlnet.faces_and_poses.DensePosePreprocessor.DensePoseCMap = Field(default=nodetool.nodes.comfy.controlnet.faces_and_poses.DensePosePreprocessor.DensePoseCMap('Viridis (MagicAnimate)'), description='The color map to use.')

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

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to preprocess.')
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the image to generate.')
    detect_hand: nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable = Field(default=nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable('enable'), description='Whether to detect hands.')
    detect_body: nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable = Field(default=nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable('enable'), description='Whether to detect bodies.')
    detect_face: nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable = Field(default=nodetool.nodes.comfy.comfy_node.OpenposePreprocessor.EnableDisable('enable'), description='Whether to detect faces.')

    @classmethod
    def get_node_type(cls): return "comfy.controlnet.faces_and_poses.OpenposePreprocessor"


