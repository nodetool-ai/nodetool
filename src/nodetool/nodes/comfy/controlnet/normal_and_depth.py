from enum import Enum
import numpy as np
from pydantic import Field
from nodetool.metadata.types import ImageTensor, Mask
from nodetool.common.comfy_node import EnableDisable
from nodetool.nodes.comfy.controlnet import PreprocessImage
from nodetool.workflows.base_node import add_node_classname


class LeReSDepthMapPreprocessor(PreprocessImage):
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
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to inpaint."
    )
    mask: Mask = Field(default=Mask(), description="The mask to use for inpainting.")


class MeshGraphormerDepthMapPreprocessor(PreprocessImage):
    mask_bbox_padding: int = Field(
        default=30,
        description="The padding for the mask bounding box.",
        ge=0,
        le=100,
    )


class MIDASNormalMapPreprocessor(PreprocessImage):
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
    comfy_class: str = "BAE-NormalMapPreprocessor"


add_node_classname(BAE_Normal_Map_Preprocessor)


class ZoeDepthMapPreprocessor(PreprocessImage):
    pass
