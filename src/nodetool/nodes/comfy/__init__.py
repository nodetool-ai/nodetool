from typing import Any
from nodetool.common.comfy_node import ComfyNode
import nodetool.nodes.comfy.advanced
import nodetool.nodes.comfy.advanced.conditioning
import nodetool.nodes.comfy.advanced.loaders
import nodetool.nodes.comfy.advanced.model
import nodetool.nodes.comfy.conditioning
import nodetool.nodes.comfy.controlnet
import nodetool.nodes.comfy.controlnet.faces_and_poses
import nodetool.nodes.comfy.controlnet.semantic_segmentation
import nodetool.nodes.comfy.controlnet.normal_and_depth
import nodetool.nodes.comfy.controlnet.others
import nodetool.nodes.comfy.controlnet.line_extractors
import nodetool.nodes.comfy.controlnet.t2i
import nodetool.nodes.comfy.essentials.conditioning
import nodetool.nodes.comfy.essentials.image
import nodetool.nodes.comfy.essentials.mask
import nodetool.nodes.comfy.essentials.misc
import nodetool.nodes.comfy.essentials.sampling
import nodetool.nodes.comfy.essentials.segmentation
import nodetool.nodes.comfy.essentials.text
import nodetool.nodes.comfy.flux
import nodetool.nodes.comfy.generate
import nodetool.nodes.comfy.image
import nodetool.nodes.comfy.image.animation
import nodetool.nodes.comfy.image.batch
import nodetool.nodes.comfy.image.preprocessors
import nodetool.nodes.comfy.image.transform
import nodetool.nodes.comfy.image.upscaling
import nodetool.nodes.comfy.ipadapter
import nodetool.nodes.comfy.latent
import nodetool.nodes.comfy.latent.advanced
import nodetool.nodes.comfy.latent.batch
import nodetool.nodes.comfy.latent.inpaint
import nodetool.nodes.comfy.latent.stable_cascade
import nodetool.nodes.comfy.latent.transform
import nodetool.nodes.comfy.latent.video
import nodetool.nodes.comfy.loaders
import nodetool.nodes.comfy.mask
import nodetool.nodes.comfy.mask.compositing
import nodetool.nodes.comfy.sampling
import nodetool.nodes.comfy.sampling.samplers
import nodetool.nodes.comfy.sampling.schedulers
import nodetool.nodes.comfy.sampling.sigmas
import nodetool.nodes.comfy.sampling.guiders
import nodetool.nodes.comfy.sampling.noise
import nodetool.nodes.comfy.basic


class PrimitiveNode(ComfyNode):
    _comfy_class = "PrimitiveNode"

    @classmethod
    def return_type(cls):
        return Any


class Note(ComfyNode):
    _comfy_class = "Note"

    @classmethod
    def is_visible(cls):
        return False


# hs issues
# class UpscaleModel(BaseNode):
#     """
#     Upscales an image using a specified upscale model.
#     image, upscaling, high-resolution

#     Use cases:
#     - Enhancing the resolution of images
#     - Improving image quality for further editing or processing
#     - Creating high-resolution versions of low-resolution inputs
#     """

#     upscale_model: UpscaleModelFile = Field(
#         default=UpscaleModelFile(name="RealESRGAN_x2.pth"),
#         description="Upscale model to use.",
#     )
#     input_image: ImageRef = Field(
#         default=ImageRef(),
#         description="The image to upscale.",
#     )

#     _upscale_model: Any | None = None

#     async def initialize(self, context: ProcessingContext):
#         upscale_loader = UpscaleModelLoader()
#         self._upscale_model = upscale_loader.load_model(self.upscale_model.name)[0]

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         input_tensor = await context.image_to_torch_tensor(self.input_image)

#         upscaled_tensor = ImageUpscaleWithModel().upscale(
#             self._upscale_model, input_tensor.unsqueeze(0)
#         )[0]

#         return await context.image_from_numpy(
#             upscaled_tensor.to(dtype=torch.float16).squeeze().cpu().numpy()
#         )
