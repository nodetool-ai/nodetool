from enum import Enum
from pydantic import Field, validator
from nodetool.metadata.types import (
    CLIP,
    GLIGEN,
    VAE,
    CLIPFile,
    CLIPVision,
    CLIPVisionFile,
    CheckpointFile,
    ControlNet,
    ControlNetFile,
    GLIGENFile,
    LORAFile,
    UNet,
    UNetFile,
    UpscaleModel,
    UpscaleModelFile,
    VAEFile,
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

    @classmethod
    def get_title(cls):
        return "Load Checkpoint"

    async def process(self, context: ProcessingContext):
        if self.ckpt_name.name == "":
            raise Exception("Checkpoint name must be selected.")

        unet, clip, vae = await self.call_comfy_node(context)

        context.add_model("comfy.unet", self.ckpt_name.name, unet)
        context.add_model("comfy.clip", self.ckpt_name.name, clip)
        context.add_model("comfy.vae", self.ckpt_name.name, vae)

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

    async def process(self, context: ProcessingContext):
        if self.ckpt_name.name == "":
            raise Exception("Checkpoint name must be selected.")

        unet, clip, vae, clip_vision = await self.call_comfy_node(context)

        context.add_model("comfy.unet", self.ckpt_name.name, unet)
        context.add_model("comfy.clip", self.ckpt_name.name, clip)
        context.add_model("comfy.vae", self.ckpt_name.name, vae)
        context.add_model("comfy.clip_vision", self.ckpt_name.name, clip_vision)

        return {
            "model": UNet(name=self.ckpt_name.name),
            "clip": CLIP(name=self.ckpt_name.name),
            "vae": VAE(name=self.ckpt_name.name),
            "clip_vision": CLIPVision(name=self.ckpt_name.name),
        }


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

    async def process(self, context: ProcessingContext):
        if self.clip_name.name == "":
            raise Exception("CLIP vision name must be selected.")
        (clip_vision,) = await self.call_comfy_node(context)
        context.add_model("comfy.clip_vision", self.clip_name.name, clip_vision)
        return {"clip_vision": CLIPVision(name=self.clip_name.name)}


class ControlNetLoader(ComfyNode):
    control_net_name: ControlNetFile = Field(
        default=ControlNetFile(), description="The filename of the control net to load."
    )

    @classmethod
    def return_type(cls):
        return {"control_net": ControlNet}

    @classmethod
    def get_title(cls):
        return "Load ControlNet Model"

    @classmethod
    def is_cacheable(cls):
        return False

    async def process(self, context: ProcessingContext):
        if self.control_net_name.name == "":
            raise Exception("ControlNet name must be selected.")
        (control_net,) = await self.call_comfy_node(context)
        context.add_model("comfy.control_net", self.control_net_name.name, control_net)
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
    def get_title(cls):
        return "Load Upscale Model"

    @classmethod
    def is_cacheable(cls):
        return False

    async def process(self, context: ProcessingContext):
        if self.model_name.name == "":
            raise Exception("Upscale model name must be selected.")
        (upscale_model,) = await self.call_comfy_node(context)
        context.add_model("comfy.upscale_model", self.model_name.name, upscale_model)
        return {"upscale_model": UpscaleModel(name=self.model_name.name)}


class GLIGENLoader(ComfyNode):
    gligen_name: GLIGENFile = Field(
        default=GLIGENFile(),
        description="The GLIGEN checkpoint to load.",
    )

    @classmethod
    def return_type(cls):
        return {"gligen": GLIGEN}

    @classmethod
    def get_title(cls):
        return "Load GLIGEN Model"

    @classmethod
    def is_cacheable(cls):
        return False

    async def process(self, context: ProcessingContext):
        if self.gligen_name.name == "":
            raise Exception("GLIGEN name must be selected.")
        (gligen,) = await self.call_comfy_node(context)
        context.add_model("comfy.gligen", self.gligen_name.name, gligen)
        return {"gligen": GLIGEN(name=self.gligen_name.name)}


class LoraLoader(ComfyNode):
    model: UNet = Field(default=UNet(), description="The model to apply Lora to.")
    clip: CLIP = Field(default=CLIP(), description="The CLIP model to apply Lora to.")
    lora_name: LORAFile = Field(
        default=LORAFile(), description="The name of the LoRA to load."
    )
    strength_model: float = Field(
        default=1.0,
        description="The strength of the LoRA to apply to the model.",
        ge=-20.0,  # ge is 'greater than or equal to'
        le=20.0,  # le is 'less than or equal to'
    )
    strength_clip: float = Field(
        default=1.0,
        description="The strength of the LoRA to apply to the CLIP.",
        ge=-20.0,  # ge is 'greater than or equal to'
        le=20.0,  # le is 'less than or equal to'
    )

    @classmethod
    def get_ttile(cls):
        return "Load LoRA"

    @classmethod
    def return_type(cls):
        return {
            "model": UNet,
            "clip": CLIP,
        }

    async def process(self, context: ProcessingContext):
        if self.lora_name.name == "":
            raise Exception("LoRA name must be selected.")

        unet, clip = await self.call_comfy_node(context)

        context.add_model("comfy.unet", self.lora_name.name, unet)
        context.add_model("comfy.clip", self.lora_name.name, clip)

        return {
            "model": UNet(name=self.lora_name.name),
            "clip": CLIP(name=self.lora_name.name),
        }


class LoraLoaderModelOnly(ComfyNode):
    model: UNet = Field(default=UNet(), description="The model to apply Lora to.")
    lora_name: LORAFile = Field(
        default=LORAFile(), description="The name of the LoRA to load."
    )
    strength_model: float = Field(
        default=1.0,
        description="The strength of the LoRA to apply to the model.",
        ge=-20.0,  # ge is 'greater than or equal to'
        le=20.0,  # le is 'less than or equal to'
    )

    @classmethod
    def get_ttile(cls):
        return "Load LoRA (Model only)"

    @classmethod
    def return_type(cls):
        return {"unet": UNet}

    async def process(self, context: ProcessingContext):
        if self.lora_name.name == "":
            raise Exception("LoRA name must be selected.")

        lora, _ = await self.call_comfy_node(context)

        context.add_model("comfy.lora", self.lora_name.name, lora)
        return {
            "model": UNet(name=self.lora_name.name),
        }


class VAELoader(ComfyNode):
    vae_name: VAEFile = Field(
        default=VAEFile(), description="The name of the VAE to load."
    )

    @classmethod
    def get_title(cls):
        return "Load VAE"

    @classmethod
    def return_type(cls):
        return {"vae": VAE}

    async def process(self, context: ProcessingContext):
        if self.vae_name.name == "":
            raise Exception("VAE name must be selected.")

        (vae,) = await self.call_comfy_node(context)
        context.add_model("comfy.vae", self.vae_name.name, vae)
        return {"vae": VAE(name=self.vae_name.name)}


class CLIPLoader(ComfyNode):
    clip_name: CLIPFile = Field(
        default=CLIPFile(),
        description="The name of the CLIP to load.",
    )

    async def process(self, context: ProcessingContext):
        if self.clip_name.name == "":
            raise Exception("CLIP name must be selected")

        (clip,) = await self.call_comfy_node(context)
        context.add_model("comfy.clip", self.clip_name.name, clip)
        return {"clip": CLIP(name=self.clip_name.name)}

    @classmethod
    def get_title(cls):
        return "Load CLIP"

    @classmethod
    def return_type(cls):
        return {"clip": CLIP}


class DualCLIPEnum(str, Enum):
    SDXL = "sdxl"
    SD3 = "sd3"
    FLUX = "flux"


class DualCLIPLoader(ComfyNode):
    clip_name1: CLIPFile = Field(
        default=CLIPFile(),
        description="The name of the CLIP to load.",
    )
    clip_name2: CLIPFile = Field(
        default=CLIPFile(),
        description="The name of the CLIP to load.",
    )
    type: DualCLIPEnum = Field(
        default=DualCLIPEnum.SDXL,
        description="The type of the dual CLIP model to load.",
    )

    async def process(self, context: ProcessingContext):
        if self.clip_name1.name == "":
            raise Exception("CLIP name must be selected")

        (clip,) = await self.call_comfy_node(context)

        context.add_model("comfy.clip", self.clip_name1.name, clip)
        return {"clip": CLIP(name=self.clip_name1.name)}

    @classmethod
    def get_title(cls):
        return "Load Dual CLIP"

    @classmethod
    def return_type(cls):
        return {"clip": CLIP}


class WeightDataTypeEnum(str, Enum):
    DEFAULT = "default"
    FP8_E4M3FN = "fp8_e4m3fn"
    FP8_E5M2 = "fp8_e5m2"


class UNETLoader(ComfyNode):
    unet_name: UNetFile = Field(
        default=UNetFile(),
        description="The name of the UNet model to load.",
    )
    weight_dtype: WeightDataTypeEnum = Field(
        WeightDataTypeEnum.DEFAULT,
        description="The weight data type to use.",
    )

    async def process(self, context: ProcessingContext):
        if self.unet_name.name == "":
            raise Exception("UNet name must be selected")

        (unet,) = await self.call_comfy_node(context)
        context.add_model("comfy.unet", self.unet_name.name, unet)

        return {"unet": UNet(name=self.unet_name.name)}

    @classmethod
    def get_title(cls):
        return "Load Diffusion Model"

    @classmethod
    def return_type(cls):
        return {"unet": UNet}
