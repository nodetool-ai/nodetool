from enum import Enum
import numpy as np
from pydantic import Field
from nodetool.metadata.types import ImageRef, Mask
from nodetool.common.comfy_node import MAX_RESOLUTION, EnableDisable
from nodetool.nodes.comfy.controlnet import PreprocessImage
from nodetool.workflows.base_node import add_comfy_classname


class LeReSDepthMapPreprocessor(PreprocessImage):
    _comfy_class: str = "LeReS-DepthMapPreprocessor"

    rm_nearest: float = Field(
        default=0.0, description="The nearest depth to remove.", ge=0.0, le=100.0
    )
    rm_background: float = Field(
        default=0.0, description="The background depth to remove.", ge=0.0, le=100.0
    )
    boost: EnableDisable = Field(
        default=EnableDisable.DISABLE,
        description="Whether to boost the depth map.",
    )


class InpaintPreprocessor(PreprocessImage):
    image: ImageRef = Field(default=ImageRef(), description="The image to inpaint.")
    mask: Mask = Field(default=Mask(), description="The mask to use for inpainting.")


# issues loading this
# class MeshGraphormerDepthMapPreprocessor(PreprocessImage):
#     _comfy_class: str = "MeshGraphormer-DepthMapPreprocessor"

#     mask_bbox_padding: int = Field(
#         default=30,
#         description="The padding for the mask bounding box.",
#         ge=0,
#         le=100,
#     )


class MIDASNormalMapPreprocessor(PreprocessImage):
    _comfy_class: str = "MiDaS-NormalMapPreprocessor"

    a: float = Field(
        default=np.pi * 2.0,
        description="Parameter 'a' for the MIDAS Normal Map Preprocessor.",
        ge=0.0,
        le=np.pi * 5.0,
    )
    bg_threshold: float = Field(
        default=0.1,
        description="Background threshold for the MIDAS Normal Map Preprocessor.",
        ge=0,
        le=1,
    )


class MIDASDepthMapPreprocessor(PreprocessImage):
    _comfy_class = "MiDaS-DepthMapPreprocessor"

    a: float = Field(
        default=np.pi * 2.0,
        description="Parameter 'a' for the MIDAS Depth Map Preprocessor.",
        ge=0.0,
        le=np.pi * 5.0,
    )
    bg_threshold: float = Field(
        default=0.1,
        description="Background threshold for the MIDAS Depth Map Preprocessor.",
        ge=0,
        le=1,
    )


class BAE_Normal_Map_Preprocessor(PreprocessImage):
    _comfy_class: str = "BAE-NormalMapPreprocessor"


add_comfy_classname(BAE_Normal_Map_Preprocessor)


class ZoeDepthMapPreprocessor(PreprocessImage):
    _comfy_class: str = "Zoe-DepthMapPreprocessor"


class DepthAnythingModel(str, Enum):
    DEPTH_ANYTHING_V2_VITL = "depth_anything_v2_vitl.pth"
    DEPTH_ANYTHING_V2_VITB = "depth_anything_v2_vitb.pth"
    DEPTH_ANYTHING_V2_VITS = "depth_anything_v2_vits.pth"


class DepthAnythingV2Preprocessor(PreprocessImage):
    ckpt_name: DepthAnythingModel = Field(
        default=DepthAnythingModel.DEPTH_ANYTHING_V2_VITS,
        description="The checkpoint name to use.",
    )


class ZoeDepthAnythingEnvironment(str, Enum):
    INDOOR = "indoor"
    OUTDOOR = "outdoor"


class Zoe_DepthAnythingPreprocessor(PreprocessImage):
    environment: ZoeDepthAnythingEnvironment = Field(
        default=ZoeDepthAnythingEnvironment.INDOOR,
        description="The environment to use.",
    )


class DSINE_Normal_Map_Preprocessor(PreprocessImage):
    _comfy_class: str = "DSINE-NormalMapPreprocessor"

    fov: float = Field(
        default=60.0,
        description="The field of view to use.",
        ge=0.0,
        le=365.0,
    )
    iterations: int = Field(
        default=5,
        description="The number of iterations to use.",
        ge=1,
        le=20,
    )


class Metric3D_Depth_Map_Backbone(str, Enum):
    VIT_SMALL = "vit-small"
    VIT_LARGE = "vit-large"
    VIT_GIANT2 = "vit-giant2"


class Metric3D_Depth_Map_Preprocessor(PreprocessImage):
    _comfy_class: str = "Metric3D-DepthMapPreprocessor"

    backbone: Metric3D_Depth_Map_Backbone = Field(
        default=Metric3D_Depth_Map_Backbone.VIT_SMALL,
        description="The backbone to use.",
    )
    fx: int = Field(
        default=1000,
        description="The fx to use.",
        ge=1,
        le=MAX_RESOLUTION,
    )
    fy: int = Field(
        default=1000,
        description="The fy to use.",
        ge=1,
        le=MAX_RESOLUTION,
    )
