from pydantic import Field
from nodetool.nodes.comfy.controlnet import PreprocessImage
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.segment_anything as segment_anything
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.anime_face_segment as anime_face_segment
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.oneformer as oneformer
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.uniformer as uniformer


class SAMPreprocessor(PreprocessImage):
    """
    SAM preprocessor.
    """

    _comfy_class = segment_anything.SAM_Preprocessor


class AnimeFace_SemSegPreprocessor(PreprocessImage):
    """
    AnimeFace semantic segmentation preprocessor.
    """

    _comfy_class = anime_face_segment.AnimeFace_SemSegPreprocessor

    remove_background_using_abgr: bool = Field(
        default=True,
        description="Whether to remove the background.",
    )
    resolution: int = Field(
        default=512, description="The width of the image to generate.", ge=512, le=512
    )


class OneFormerCOCOSemSegPreprocessor(PreprocessImage):
    """
    OneFormer COCO semantic segmentation preprocessor.
    """

    _comfy_class = oneformer.OneFormer_COCO_SemSegPreprocessor


class OneFormer_ADE20K_SemSegPreprocessor(PreprocessImage):
    """
    OneFormer ADE20K semantic segmentation preprocessor.
    """

    _comfy_class = oneformer.OneFormer_ADE20K_SemSegPreprocessor


class UniformerSemSegPreprocessor(PreprocessImage):
    """
    Uniformer semantic segmentation preprocessor.
    """

    _comfy_class = uniformer.Uniformer_SemSegPreprocessor
