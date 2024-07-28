from enum import Enum
from pydantic import Field, validator
from nodetool.metadata.types import (
    CLIP,
    GLIGEN,
    VAE,
    CLIPVision,
    CLIPVisionFile,
    CheckpointFile,
    ControlNet,
    ControlNetFile,
    GLIGENFile,
    UNet,
    UpscaleModel,
    UpscaleModelFile,
    unCLIPFile,
)
from nodetool.common.comfy_node import ComfyNode
from nodetool.workflows.processing_context import ProcessingContext


class CheckpointLoaderSimple(ComfyNode):
    """
    Loads a checkpoint.
    """

    ckpt_name: CheckpointFile = Field(
        default=CheckpointFile(), description="The checkpoint to load."
    )

    @classmethod
    def return_type(cls):
        return {"model": UNet, "clip": CLIP, "vae": VAE}
    

    async def initialize(self, context: ProcessingContext):
        unet, clip, vae, _ = await super().process(context)

        context.add_model("comfy.unet", self.ckpt_name.name, unet)
        context.add_model("comfy.clip", self.ckpt_name.name, clip)
        context.add_model("comfy.vae", self.ckpt_name.name, vae)

    
    async def process(self, context: ProcessingContext):
        return {
            "model": UNet(name=self.ckpt_name.name),
            "clip": CLIP(name=self.ckpt_name.name),
            "vae": VAE(name=self.ckpt_name.name),
        }

    @classmethod
    def is_cacheable(cls):
        return False


class CheckpointLoader(CheckpointLoaderSimple):
    """
    Loads a checkpoint.
    """

    pass


class unCLIPCheckpointLoader(ComfyNode):
    ckpt_name: unCLIPFile = Field(
        default=unCLIPFile(), description="The checkpoint to load."
    )

    @classmethod
    def return_type(cls):
        return {"model": UNet, "clip": CLIP, "vae": VAE, "clip_vision": CLIPVision}

    @classmethod
    def is_cacheable(cls):
        return False


class CLIPVisionLoader(ComfyNode):
    clip_name: CLIPVisionFile = Field(
        default=CLIPVisionFile(),
        description="The name of the CLIP vision model to load.",
    )

    @classmethod
    def return_type(cls):
        return {"clip_vision": CLIPVision}

    @classmethod
    def is_cacheable(cls):
        return False


class ControlNetLoader(ComfyNode):
    control_net_name: ControlNetFile = Field(
        default=ControlNetFile(), description="The filename of the control net to load."
    )
    @classmethod
    def return_type(cls):
        return {"control_net": ControlNet}

    @classmethod
    def is_cacheable(cls):
        return False
    
    async def initialize(self, context: ProcessingContext):
        control_net, = await super().process(context)
        context.add_model("comfy.control_net", self.control_net_name.name, control_net)
    
    async def process(self, context: ProcessingContext):
        return {"control_net": ControlNet(name=self.control_net_name.name)}


class UpscaleModelLoader(ComfyNode):
    model_name: UpscaleModelFile = Field(
        default=UpscaleModelFile(),
        description="The filename of the upscale model to load.",
    )

    @classmethod
    def return_type(cls):
        return {"upscale_model": UpscaleModel}

    @classmethod
    def is_cacheable(cls):
        return False


class GLIGENLoader(ComfyNode):
    gligen_name: GLIGENFile = Field(
        default=GLIGENFile(),
        description="The GLIGEN checkpoint to load.",
    )

    @classmethod
    def return_type(cls):
        return {"gligen": GLIGEN}

    @classmethod
    def is_cacheable(cls):
        return False
