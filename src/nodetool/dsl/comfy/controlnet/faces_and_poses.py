from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.comfy.controlnet.faces_and_poses import Toggle
from nodetool.nodes.comfy.controlnet.faces_and_poses import Toggle
from nodetool.nodes.comfy.controlnet.faces_and_poses import Toggle
from nodetool.nodes.comfy.controlnet.faces_and_poses import BBoxDetectorModel
from nodetool.nodes.comfy.controlnet.faces_and_poses import PoseEstimatorModel


class DWPose_Preprocessor(GraphNode):
    detect_hand: Toggle | GraphNode | tuple[GraphNode, str] = Field(
        default=Toggle("enable"),
        description="Toggle to enable or disable hand detection.",
    )
    detect_body: Toggle | GraphNode | tuple[GraphNode, str] = Field(
        default=Toggle("enable"),
        description="Toggle to enable or disable body detection.",
    )
    detect_face: Toggle | GraphNode | tuple[GraphNode, str] = Field(
        default=Toggle("enable"),
        description="Toggle to enable or disable face detection.",
    )
    bbox_detector: BBoxDetectorModel | GraphNode | tuple[GraphNode, str] = Field(
        default=BBoxDetectorModel("yolox_l.torchscript.pt"),
        description="The bounding box detector model to use.",
    )
    pose_estimator: PoseEstimatorModel | GraphNode | tuple[GraphNode, str] = Field(
        default=PoseEstimatorModel("dw-ll_ucoco_384_bs5.torchscript.pt"),
        description="The pose estimator model to use.",
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.faces_and_poses.DWPose_Preprocessor"


from nodetool.common.comfy_node import DensePoseModel
from nodetool.nodes.comfy.controlnet.faces_and_poses import DensePoseCMap


class DensePosePreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    model: DensePoseModel | GraphNode | tuple[GraphNode, str] = Field(
        default=DensePoseModel("densepose_r50_fpn_dl.torchscript"),
        description="The model to use.",
    )
    cmap: DensePoseCMap | GraphNode | tuple[GraphNode, str] = Field(
        default=DensePoseCMap("Viridis (MagicAnimate)"),
        description="The color map to use.",
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.faces_and_poses.DensePosePreprocessor"


class MediaPipeFaceMeshPreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    max_faces: int | GraphNode | tuple[GraphNode, str] = Field(
        default=10, description="The maximum number of faces to detect."
    )
    min_confidence: float | GraphNode | tuple[GraphNode, str] = Field(
        default=0.5, description="The minimum confidence for face detection."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.faces_and_poses.MediaPipeFaceMeshPreprocessor"


from nodetool.common.comfy_node import EnableDisable
from nodetool.common.comfy_node import EnableDisable
from nodetool.common.comfy_node import EnableDisable


class OpenposePreprocessor(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(
        default=ImageTensor(type="comfy.image_tensor"),
        description="The image to preprocess.",
    )
    resolution: int | GraphNode | tuple[GraphNode, str] = Field(
        default=512, description="The width of the image to generate."
    )
    detect_hand: EnableDisable | GraphNode | tuple[GraphNode, str] = Field(
        default=EnableDisable("enable"), description="Whether to detect hands."
    )
    detect_body: EnableDisable | GraphNode | tuple[GraphNode, str] = Field(
        default=EnableDisable("enable"), description="Whether to detect bodies."
    )
    detect_face: EnableDisable | GraphNode | tuple[GraphNode, str] = Field(
        default=EnableDisable("enable"), description="Whether to detect faces."
    )

    @classmethod
    def get_node_type(cls):
        return "comfy.controlnet.faces_and_poses.OpenposePreprocessor"


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
