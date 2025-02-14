from enum import Enum

from pydantic import Field
from nodetool.metadata.types import ImageRef
from nodetool.nodes.comfy.comfy_node import DensePoseModel

from nodetool.nodes.comfy.comfy_node import ComfyNode, EnableDisable
from nodetool.nodes.comfy.controlnet import PreprocessImage
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.densepose as densepose
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.dwpose as dwpose
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.openpose as openpose


class Toggle(str, Enum):
    ENABLE = "enable"
    DISABLE = "disable"


class DensePoseCMap(str, Enum):
    VIRIDIS = "Viridis (MagicAnimate)"
    PARULA = "Parula (CivitAI)"


class BBoxDetectorModel(str, Enum):
    YOLOX_L_TORCHSCRIPT_PT = "yolox_l.torchscript.pt"
    YOLOX_L_ONNX = "yolox_l.onnx"
    YOLO_NAS_L_FP16_ONNX = "yolo_nas_l_fp16.onnx"
    YOLO_NAS_M_FP16_ONNX = "yolo_nas_m_fp16.onnx"
    YOLO_NAS_S_FP16_ONNX = "yolo_nas_s_fp16.onnx"


class PoseEstimatorModel(str, Enum):
    DW_LL_UCOCO_384_BS5_TORCHSCRIPT_PT = "dw-ll_ucoco_384_bs5.torchscript.pt"
    DW_LL_UCOCO_384_ONNX = "dw-ll_ucoco_384.onnx"
    DW_LL_UCOCO_ONNX = "dw-ll_ucoco.onnx"


class DensePosePreprocessor(PreprocessImage):
    """
    Estimates dense poses from an image.
    controlnet, faces_and_poses, densepose
    """

    _comfy_class = densepose.DensePose_Preprocessor

    model: DensePoseModel = Field(
        default=DensePoseModel.DENSEPOSE_R50_FPN_DL, description="The model to use."
    )
    cmap: DensePoseCMap = Field(
        default=DensePoseCMap.VIRIDIS, description="The color map to use."
    )


class DWPose_Preprocessor(ComfyNode):
    """
    Estimates poses from an image.
    controlnet, faces_and_poses, dw_pose
    """

    _comfy_class = dwpose.DWPose_Preprocessor

    detect_hand: Toggle = Field(
        default=Toggle.ENABLE, description="Toggle to enable or disable hand detection."
    )
    detect_body: Toggle = Field(
        default=Toggle.ENABLE, description="Toggle to enable or disable body detection."
    )
    detect_face: Toggle = Field(
        default=Toggle.ENABLE, description="Toggle to enable or disable face detection."
    )
    bbox_detector: BBoxDetectorModel = Field(
        default=BBoxDetectorModel.YOLOX_L_TORCHSCRIPT_PT,
        description="The bounding box detector model to use.",
    )
    pose_estimator: PoseEstimatorModel = Field(
        default=PoseEstimatorModel.DW_LL_UCOCO_384_BS5_TORCHSCRIPT_PT,
        description="The pose estimator model to use.",
    )

    @classmethod
    def return_type(cls):
        return {"type": ImageRef}


class OpenposePreprocessor(PreprocessImage):
    """
    Estimates poses from an image.
    controlnet, faces_and_poses, openpose
    """

    _comfy_class = openpose.OpenPose_Preprocessor

    detect_hand: EnableDisable = Field(
        default=EnableDisable.ENABLE,
        description="Whether to detect hands.",
    )
    detect_body: EnableDisable = Field(
        default=EnableDisable.ENABLE,
        description="Whether to detect bodies.",
    )
    detect_face: EnableDisable = Field(
        default=EnableDisable.ENABLE,
        description="Whether to detect faces.",
    )


# dependency problems
# class MediaPipeFaceMeshPreprocessor(PreprocessImage):
#     _comfy_class = "MediaPipe-FaceMeshPreprocessor"
#     max_faces: int = Field(
#         default=10, description="The maximum number of faces to detect."
#     )
#     min_confidence: float = Field(
#         default=0.5, description="The minimum confidence for face detection."
#     )
