from ..utils import common_annotator_call, create_node_input_types
import comfy.model_management as model_management

class Manga2Anime_LineArt_Preprocessor:
    @classmethod
    def INPUT_TYPES(s):
        return create_node_input_types()

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"

    CATEGORY = "ControlNet Preprocessors/Line Extractors"

    def execute(self, image, resolution=512, **kwargs):
        from controlnet_aux.manga_line import LineartMangaDetector

        model = LineartMangaDetector.from_pretrained().to(model_management.get_torch_device())
        out = common_annotator_call(model, image, resolution=resolution)
        del model
        return (out, )

NODE_CLASS_MAPPINGS = {
    "Manga2Anime_LineArt_Preprocessor": Manga2Anime_LineArt_Preprocessor
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "Manga2Anime_LineArt_Preprocessor": "Manga Lineart (aka lineart_anime_denoise)"
}