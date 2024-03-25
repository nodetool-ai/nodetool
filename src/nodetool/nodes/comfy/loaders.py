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
    UNet,
    UpscaleModel,
    UpscaleModelFile,
)
from nodetool.nodes.comfy import ComfyNode


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


class unCLIPCheckpointEnum(str, Enum):
    WD_1_5 = "wd-1-5-beta2-unclip-h-fp16.safetensors"


class unCLIPCheckpointLoader(ComfyNode):
    ckpt_name: unCLIPCheckpointEnum = Field(
        default=unCLIPCheckpointEnum.WD_1_5, description="The checkpoint to load."
    )

    @validator("ckpt_name", pre=True)
    def validate_ckpt_name(cls, v):
        if isinstance(v, str):
            v = unCLIPCheckpointEnum(v)
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


class GLIGENCheckpointEnum(str, Enum):
    GLIGEN_SD14_TEXTBOX = "gligen_sd14_textbox_pruned_fp16.safetensors"


class GLIGENLoader(ComfyNode):
    gligen_name: GLIGENCheckpointEnum = Field(
        default=GLIGENCheckpointEnum.GLIGEN_SD14_TEXTBOX,
        description="The GLIGEN checkpoint to load.",
    )

    @validator("gligen_name", pre=True)
    def validate_gligen_name(cls, v):
        if isinstance(v, str):
            v = GLIGENCheckpointEnum(v)
        if isinstance(v, dict):
            v = GLIGENCheckpointEnum(**v)
        if v.name == "":
            raise ValueError("The GLIGEN name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {"gligen": GLIGEN}
