from ..utils import common_annotator_call, create_node_input_types, run_script
import comfy.model_management as model_management
import sys

def install_deps():
    try:
        import sklearn
    except:
        run_script([sys.executable, '-s', '-m', 'pip', 'install', 'scikit-learn'])

class DiffusionEdge_Preprocessor:
    @classmethod
    def INPUT_TYPES(s):
        return create_node_input_types(
            environment=(["indoor", "urban", "natrual"], {"default": "indoor"}),
            patch_batch_size=("INT", {"default": 4, "min": 1, "max": 16})
        )

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "execute"

    CATEGORY = "ControlNet Preprocessors/Line Extractors"

    def execute(self, image, environment="indoor", patch_batch_size=4, resolution=512, **kwargs):
        install_deps()
        from controlnet_aux.diffusion_edge import DiffusionEdgeDetector

        model = DiffusionEdgeDetector \
            .from_pretrained(filename = f"diffusion_edge_{environment}.pt") \
            .to(model_management.get_torch_device())
        out = common_annotator_call(model, image, resolution=resolution, patch_batch_size=patch_batch_size)
        del model
        return (out, )

NODE_CLASS_MAPPINGS = {
    "DiffusionEdge_Preprocessor": DiffusionEdge_Preprocessor,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "DiffusionEdge_Preprocessor": "Diffusion Edge (batch size ↑ => speed ↑, VRAM ↑)",
}