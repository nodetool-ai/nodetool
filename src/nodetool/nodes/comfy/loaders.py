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


class CheckpointLoaderSimple(ComfyNode):
    """
    Loads a checkpoint.
    """

    ckpt_name: CheckpointFile = Field(
        default=CheckpointFile(), description="The checkpoint to load."
    )

    @validator("ckpt_name", pre=True)
    def validate_ckpt_name(cls, v):
        if isinstance(v, str):
            v = CheckpointFile(name=v)
        if isinstance(v, dict):
            v = CheckpointFile(**v)
        if v.name == "":
            raise ValueError("The checkpoint name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {"model": UNet, "clip": CLIP, "vae": VAE}


class CheckpointLoader(CheckpointLoaderSimple):
    """
    Loads a checkpoint.
    """

    pass


class unCLIPCheckpointLoader(ComfyNode):
    ckpt_name: unCLIPFile = Field(
        default=unCLIPFile(), description="The checkpoint to load."
    )

    @validator("ckpt_name", pre=True)
    def validate_ckpt_name(cls, v):
        if isinstance(v, str):
            v = unCLIPFile(name=v)
        if isinstance(v, dict):
            v = unCLIPFile(**v)
        if v == "":
            raise ValueError("The checkpoint name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {"model": UNet, "clip": CLIP, "vae": VAE, "clip_vision": CLIPVision}


class CLIPVisionLoader(ComfyNode):
    clip_name: CLIPVisionFile = Field(
        default=CLIPVisionFile(),
        description="The name of the CLIP vision model to load.",
    )

    @validator("clip_name", pre=True)
    def validate_clip_name(cls, v):
        if isinstance(v, str):
            v = CLIPVisionFile(name=v)
        if isinstance(v, dict):
            v = CLIPVisionFile(**v)
        if v.name == "":
            raise ValueError("The CLIP vision name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {"clip_vision": CLIPVision}


class ControlNetLoader(ComfyNode):
    control_net_name: ControlNetFile = Field(
        default=ControlNetFile(), description="The filename of the control net to load."
    )

    @validator("control_net_name", pre=True)
    def validate_control_net_name(cls, v):
        if isinstance(v, str):
            v = ControlNetFile(name=v)
        if isinstance(v, dict):
            v = ControlNetFile(**v)
        if v.name == "":
            raise ValueError("The control net name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {"control_net": ControlNet}


class UpscaleModelLoader(ComfyNode):
    model_name: UpscaleModelFile = Field(
        default=UpscaleModelFile(),
        description="The filename of the upscale model to load.",
    )

    @validator("model_name", pre=True)
    def validate_model_name(cls, v):
        if isinstance(v, str):
            v = UpscaleModelFile(name=v)
        if isinstance(v, dict):
            v = UpscaleModelFile(**v)
        if v.name == "":
            raise ValueError("The model name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {"upscale_model": UpscaleModel}


class GLIGENLoader(ComfyNode):
    gligen_name: GLIGENFile = Field(
        default=GLIGENFile(),
        description="The GLIGEN checkpoint to load.",
    )

    @validator("gligen_name", pre=True)
    def validate_gligen_name(cls, v):
        if isinstance(v, str):
            v = GLIGENFile(name=v)
        if isinstance(v, dict):
            v = GLIGENFile(**v)
        if v.name == "":
            raise ValueError("The GLIGEN name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {"gligen": GLIGEN}
