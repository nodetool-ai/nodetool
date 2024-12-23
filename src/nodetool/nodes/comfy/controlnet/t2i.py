from nodetool.nodes.comfy.controlnet import PreprocessImage
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.color as color
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.shuffle as shuffle


class ColorPreprocessor(PreprocessImage):
    """
    Color preprocessor.
    """

    _comfy_class = color.Color_Preprocessor


class ShufflePreprocessor(PreprocessImage):
    """
    Shuffle preprocessor.
    """

    _comfy_class = shuffle.Shuffle_Preprocessor
