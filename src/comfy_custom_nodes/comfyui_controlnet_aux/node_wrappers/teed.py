from ..utils import common_annotator_call, create_node_input_types
import comfy.model_management as model_management

class TEED_Preprocessor:
    @classmethod
    def INPUT_TYPES(s):
        return create_node_input_types(
            safe_steps=("INT", {"default": 2, "min": 0, "max": 10})
        )

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"

    CATEGORY = "ControlNet Preprocessors/Line Extractors"

    def execute(self, image, safe_steps=2, resolution=512, **kwargs):
        from controlnet_aux.teed import TEDDetector

        model = TEDDetector.from_pretrained().to(model_management.get_torch_device())
        out = common_annotator_call(model, image, resolution=resolution, safe_steps=safe_steps)
        del model
        return (out, )

NODE_CLASS_MAPPINGS = {
    "TEEDPreprocessor": TEED_Preprocessor,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "TEED_Preprocessor": "TEED Soft-Edge Lines",
}