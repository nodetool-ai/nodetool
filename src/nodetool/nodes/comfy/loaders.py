from enum import Enum
from typing import Sequence

import torch
import comfy.sd
import comfy.controlnet
import comfy.utils
import comfy.clip_vision
from huggingface_hub import try_to_load_from_cache
from pydantic import Field
import folder_paths
import nodes
from nodetool.metadata.types import (
    CLIP,
    GLIGEN,
    HFCLIP,
    HFVAE,
    VAE,
    CLIPFile,
    CLIPVision,
    CLIPVisionFile,
    CheckpointFile,
    ControlNet,
    ControlNetFile,
    GLIGENFile,
    HFCLIPVision,
    HFCheckpointModel,
    HFControlNet,
    HFIPAdapter,
    HFLoraSD,
    HFStableDiffusion,
    HFStyleModel,
    HFUnet,
    HuggingFaceModel,
    IPAdapter,
    IPAdapterFile,
    LORAFile,
    UNet,
    UNetFile,
    UpscaleModel,
    UpscaleModelFile,
    VAEFile,
    unCLIPFile,
    StyleModel,
    StyleModelFile,
)
from nodetool.nodes.comfy.comfy_node import ComfyNode
from nodetool.nodes.huggingface.lora import HF_LORA_SD_MODELS, HF_LORA_SDXL_MODELS
from nodetool.nodes.huggingface.stable_diffusion_base import (
    HF_CLIP_MODELS,
    HF_CLIP_VISION_MODELS,
    HF_FLUX_MODELS,
    HF_IP_ADAPTER_MODELS,
    HF_IP_ADAPTER_XL_MODELS,
    HF_LTXV_MODELS,
    HF_STABLE_DIFFUSION_3_MODELS,
    HF_STABLE_DIFFUSION_MODELS,
    HF_STABLE_DIFFUSION_XL_MODELS,
    HF_UNET_MODELS,
)
from nodetool.nodes.huggingface.stable_diffusion_base import HF_CONTROLNET_MODELS
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
from nodetool.nodes.comfy.comfy_node import ComfyNode, MAX_RESOLUTION


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
        if self.ckpt_name.is_empty():
            raise Exception("Checkpoint name must be selected.")

        unet, clip, vae = await self.call_comfy_node(context)

        return {
            "model": UNet(name=self.ckpt_name.name, model=unet),
            "clip": CLIP(name=self.ckpt_name.name, model=clip),
            "vae": VAE(name=self.ckpt_name.name, model=vae),
        }

    @classmethod
    def is_cacheable(cls):
        return False


class CheckpointLoader(CheckpointLoaderSimple):
    """
    Loads a checkpoint.
    """

    @classmethod
    def get_title(cls):
        return "Load Checkpoint (Advanced)"


class HuggingFaceCheckpointLoader(ComfyNode):
    """
    Loads a checkpoint from Huggingface.
    """

    # The HuggingFaceModelSelect react component will filter the recommended models
    # to HFStableDiffusion, HFStableDiffusionXL, HFStableDiffusion3, HFFlux, or HFLTXV
    # hardcoded in the HuggingFaceModelSelect component
    model: HFCheckpointModel = Field(
        default=HFCheckpointModel(),
        description="The Stable Diffusion model to load.",
    )

    @classmethod
    def return_type(cls):
        return {"model": UNet, "clip": CLIP, "vae": VAE}

    @classmethod
    def get_title(cls):
        return "Load Checkpoint from Huggingface"

    @classmethod
    def get_recommended_models(cls) -> Sequence[HuggingFaceModel]:
        return (
            HF_STABLE_DIFFUSION_MODELS
            + HF_STABLE_DIFFUSION_XL_MODELS
            + HF_STABLE_DIFFUSION_3_MODELS
            + HF_FLUX_MODELS
            + HF_LTXV_MODELS
        )

    async def process(self, context: ProcessingContext):
        if self.model.is_empty():
            raise ValueError("Model repository ID must be selected.")

        assert self.model.path is not None, "Model path must be set."

        ckpt_path = try_to_load_from_cache(self.model.repo_id, self.model.path)

        if ckpt_path is None:
            raise ValueError(
                f"Checkpoint must be downloaded from Huggingface. {self.model.repo_id} {self.model.path}"
            )

        unet, clip, vae, _ = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=True,
            output_clip=True,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )

        return {
            "model": UNet(name=self.model.repo_id, model=unet),
            "clip": CLIP(name=self.model.repo_id, model=clip),
            "vae": VAE(name=self.model.repo_id, model=vae),
        }


class unCLIPCheckpointLoader(ComfyNode):
    """
    Loads a unCLIP checkpoint.
    """

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
        if self.ckpt_name.is_empty():
            raise Exception("Checkpoint name must be selected.")

        unet, clip, vae, clip_vision = await self.call_comfy_node(context)

        return {
            "model": UNet(name=self.ckpt_name.name, model=unet),
            "clip": CLIP(name=self.ckpt_name.name, model=clip),
            "vae": VAE(name=self.ckpt_name.name, model=vae),
            "clip_vision": CLIPVision(name=self.ckpt_name.name, model=clip_vision),
        }


class CLIPVisionLoader(ComfyNode):
    """
    Loads a CLIPVision model.
    """

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
        if self.clip_name.is_empty():
            raise Exception("CLIP vision name must be selected.")
        (clip_vision,) = await self.call_comfy_node(context)
        return {"clip_vision": CLIPVision(name=self.clip_name.name, model=clip_vision)}


class HuggingFaceCLIPVisionLoader(ComfyNode):
    """
    Loads a CLIPVision model from Huggingface.
    """

    model: HFCLIPVision = Field(
        default=HFCLIPVision(),
        description="The CLIP vision model to load.",
    )

    @classmethod
    def get_recommended_models(cls) -> Sequence[HuggingFaceModel]:
        return HF_CLIP_VISION_MODELS

    @classmethod
    def get_title(cls):
        return "Load CLIP Vision from Huggingface"

    @classmethod
    def is_cacheable(cls):
        return False

    @classmethod
    def return_type(cls):
        return {"clip_vision": CLIPVision}

    async def process(self, context: ProcessingContext):
        if self.model.is_empty():
            raise Exception("CLIP vision name must be selected.")

        assert self.model.path is not None, "Model must be single file"

        clip_vision_path = try_to_load_from_cache(self.model.repo_id, self.model.path)

        if clip_vision_path is None:
            raise ValueError(
                f"CLIP vision model must be downloaded from Huggingface. {self.model.repo_id} {self.model.path}"
            )

        clip_vision = comfy.clip_vision.load(clip_vision_path)

        return {
            "clip_vision": CLIPVision(name=self.model.repo_id, model=clip_vision),
        }


class ControlNetLoader(ComfyNode):
    """
    Loads a ControlNet model.
    """

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
        if self.control_net_name.is_empty():
            raise Exception("ControlNet name must be selected.")
        (control_net,) = await self.call_comfy_node(context)
        return {
            "control_net": ControlNet(
                name=self.control_net_name.name, model=control_net
            )
        }


class HuggingFaceControlNetLoader(ComfyNode):
    """
    Loads a ControlNet model from Huggingface.
    """

    model: HFControlNet = Field(
        default=HFControlNet(),
        description="The ControlNet model to load.",
    )

    @classmethod
    def return_type(cls):
        return {"control_net": ControlNet}

    @classmethod
    def get_recommended_models(cls) -> list[HFControlNet]:
        return HF_CONTROLNET_MODELS

    @classmethod
    def get_title(cls):
        return "Load ControlNet from Huggingface"

    @classmethod
    def is_cacheable(cls):
        return False

    async def process(self, context: ProcessingContext):
        if self.model.is_empty():
            raise Exception("ControlNet name must be selected.")

        assert self.model.path is not None, "Model must be single file"

        controlnet_path = try_to_load_from_cache(self.model.repo_id, self.model.path)

        controlnet = comfy.controlnet.load_controlnet(controlnet_path)

        return {"control_net": ControlNet(name=self.model.repo_id, model=controlnet)}


class UpscaleModelLoader(ComfyNode):
    """
    Loads an upscale model.
    """

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
        if self.model_name.is_empty():
            raise Exception("Upscale model name must be selected.")
        (upscale_model,) = await self.call_comfy_node(context)
        return {
            "upscale_model": UpscaleModel(
                name=self.model_name.name, model=upscale_model
            )
        }


class GLIGENLoader(ComfyNode):
    """
    Loads a GLIGEN model.
    """

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
        if self.gligen_name.is_empty():
            raise Exception("GLIGEN name must be selected.")
        (gligen,) = await self.call_comfy_node(context)
        return {"gligen": GLIGEN(name=self.gligen_name.name, model=gligen)}


class LoraLoader(ComfyNode):
    """
    Loads a LoRA model.
    """

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
        if self.lora_name.is_empty():
            raise Exception("LoRA name must be selected.")

        assert self.model.model is not None, "Model must be connected."
        assert self.clip.model is not None, "CLIP must be connected."

        unet, clip = await self.call_comfy_node(context)

        return {
            "model": UNet(name=self.lora_name.name, model=unet),
            "clip": CLIP(name=self.lora_name.name, model=clip),
        }


class HuggingFaceLoraLoader(ComfyNode):
    """
    Loads a LoRA model from Huggingface.
    """

    model: UNet = Field(default=UNet(), description="The model to apply LoRA to.")
    clip: CLIP = Field(default=CLIP(), description="The CLIP model to apply LoRA to.")
    lora: HFLoraSD = Field(
        default=HFLoraSD(),
        description="The LoRA to load.",
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
    def get_recommended_models(cls) -> Sequence[HuggingFaceModel]:
        return HF_LORA_SD_MODELS + HF_LORA_SDXL_MODELS

    @classmethod
    def get_title(cls):
        return "Load LoRA from Huggingface"

    @classmethod
    def return_type(cls):
        return {
            "model": UNet,
            "clip": CLIP,
        }

    async def process(self, context: ProcessingContext):
        if self.lora.repo_id == "":
            raise Exception("LoRA name must be selected.")

        assert self.lora.path is not None, "Model must be single file"

        lora_path = try_to_load_from_cache(self.lora.repo_id, self.lora.path)

        assert self.model.model is not None, "Model must be connected."
        assert self.clip.model is not None, "CLIP must be connected."

        if lora_path is None:
            raise ValueError(
                f"LoRA model must be downloaded from Huggingface. {self.lora.repo_id} {self.lora.path}"
            )

        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)

        model_lora, clip_lora = comfy.sd.load_lora_for_models(
            self.model.model,
            self.clip.model,
            lora,
            self.strength_model,
            self.strength_clip,
        )
        return {
            "model": UNet(name=self.model.name, model=model_lora),
            "clip": CLIP(name=self.clip.name, model=clip_lora),
        }


class LoraLoaderModelOnly(ComfyNode):
    """
    Loads a LoRA model (model only).
    """

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
        return {"model": UNet}

    async def process(self, context: ProcessingContext):
        if self.lora_name.name == "":
            raise Exception("LoRA name must be selected.")

        (model,) = await self.call_comfy_node(context)

        return {
            "model": UNet(name=self.lora_name.name, model=model),
        }


class VAELoader(ComfyNode):
    """
    Loads a VAE model.
    """

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
        return {"vae": VAE(name=self.vae_name.name, model=vae)}


class HuggingFaceVAELoader(ComfyNode):
    """
    Loads a VAE model from Huggingface.
    """

    model: HFVAE = Field(
        default=HFVAE(),
        description="The VAE model to load.",
    )

    @classmethod
    def get_title(cls):
        return "Load VAE from Huggingface"

    @classmethod
    def return_type(cls):
        return {"vae": VAE}

    @classmethod
    def get_recommended_models(cls) -> list[HFVAE]:
        return [
            HFVAE(
                repo_id="Comfy-Org/mochi_preview_repackaged",
                path="split_files/vae/mochi_vae.safetensors",
            ),
            HFVAE(
                repo_id="black-forest-labs/FLUX.1-schnell",
                path="ae.safetensors",
            ),
        ]

    async def process(self, context: ProcessingContext):
        if self.model.is_empty():
            raise Exception("VAE model must be selected.")

        if self.model.path is None:
            raise Exception("VAE path must be set.")

        vae_path = try_to_load_from_cache(self.model.repo_id, self.model.path)

        if vae_path is None:
            raise ValueError(
                f"VAE model must be downloaded from Huggingface. {self.model.repo_id} {self.model.path}"
            )

        (vae,) = await self.call_comfy_node(context, nodes.VAELoader, vae_name=vae_path)

        return {"vae": VAE(name=self.model.repo_id, model=vae)}


def get_clip_type(type: str) -> comfy.sd.CLIPType:
    if type == "stable_cascade":
        return comfy.sd.CLIPType.STABLE_CASCADE
    elif type == "sd3":
        return comfy.sd.CLIPType.SD3
    elif type == "stable_audio":
        return comfy.sd.CLIPType.STABLE_AUDIO
    elif type == "ltxv":
        return comfy.sd.CLIPType.LTXV
    elif type == "mochi":
        return comfy.sd.CLIPType.MOCHI
    else:
        return comfy.sd.CLIPType.STABLE_DIFFUSION


class CLIPTypeEnum(str, Enum):
    STABLE_DIFFUSION = "stable_diffusion"
    STABLE_CASCADE = "stable_cascade"
    SD3 = "sd3"
    STABLE_AUDIO = "stable_audio"
    MOCHI = "mochi"
    LTXV = "ltxv"


class CLIPLoader(ComfyNode):
    """
    Loads a CLIP model.
    """

    _comfy_class = nodes.CLIPLoader

    clip_name: CLIPFile = Field(
        default=CLIPFile(),
        description="The name of the CLIP to load.",
    )
    type: CLIPTypeEnum = Field(
        default=CLIPTypeEnum.STABLE_DIFFUSION,
        description="The type of the CLIP model to load.",
    )

    async def process(self, context: ProcessingContext):
        if self.clip_name.name == "":
            raise Exception("CLIP name must be selected")

        clip_path = folder_paths.get_full_path_or_raise(
            "text_encoders", self.clip_name.name
        )
        clip_type = get_clip_type(self.type)
        clip = comfy.sd.load_clip(
            ckpt_paths=[clip_path],
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
            clip_type=clip_type,
        )
        print(clip)

        return {"clip": CLIP(name=self.clip_name.name, model=clip)}

    @classmethod
    def get_title(cls):
        return "Load CLIP"

    @classmethod
    def return_type(cls):
        return {"clip": CLIP}


class HuggingFaceCLIPLoader(ComfyNode):
    """
    Loads a CLIP model from Huggingface.
    """

    model: HFCLIP = Field(
        default=HFCLIP(),
        description="The CLIP model to load.",
    )
    type: CLIPTypeEnum = Field(
        default=CLIPTypeEnum.STABLE_DIFFUSION,
        description="The type of the CLIP model to load.",
    )

    @classmethod
    def get_recommended_models(cls) -> Sequence[HuggingFaceModel]:
        return HF_CLIP_MODELS

    @classmethod
    def get_title(cls):
        return "Load CLIP from Huggingface"

    @classmethod
    def is_cacheable(cls):
        return False

    @classmethod
    def return_type(cls):
        return {"clip": CLIP}

    async def process(self, context: ProcessingContext):
        if self.model.is_empty():
            raise Exception("CLIP model must be selected.")

        assert self.model.path is not None, "Model must be single file"

        clip_path = try_to_load_from_cache(self.model.repo_id, self.model.path)
        clip_type = get_clip_type(self.type)

        clip = comfy.sd.load_clip(
            ckpt_paths=[clip_path],
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
            clip_type=clip_type,
        )

        return {
            "clip": CLIP(name=self.model.repo_id, model=clip),
        }


class DualCLIPEnum(str, Enum):
    """
    The type of the dual CLIP model to load.
    """

    SDXL = "sdxl"
    SD3 = "sd3"
    FLUX = "flux"


class DualCLIPLoader(ComfyNode):
    """
    Loads a dual CLIP model.
    """

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

        return {"clip": CLIP(name=self.clip_name1.name, model=clip)}

    @classmethod
    def get_title(cls):
        return "Load Dual CLIP"

    @classmethod
    def return_type(cls):
        return {"clip": CLIP}


class HuggingFaceDualCLIPLoader(ComfyNode):
    """
    Loads a dual CLIP model from Huggingface.
    """

    type: DualCLIPEnum = Field(
        default=DualCLIPEnum.SDXL,
        description="The type of the dual CLIP model to load.",
    )
    clip_model_1: HFCLIP = Field(
        default=HFCLIP(),
        description="The first CLIP model to load.",
    )
    clip_model_2: HFCLIP = Field(
        default=HFCLIP(),
        description="The second CLIP model to load.",
    )

    @classmethod
    def get_recommended_models(cls) -> Sequence[HuggingFaceModel]:
        return HF_CLIP_MODELS

    async def process(self, context: ProcessingContext):
        if self.clip_model_1.repo_id == "" or self.clip_model_1.path is None:
            raise Exception("Model 1 must be selected")

        if self.clip_model_2.repo_id == "" or self.clip_model_2.path is None:
            raise Exception("Model 2 must be selected")

        clip_path1 = try_to_load_from_cache(
            self.clip_model_1.repo_id, self.clip_model_1.path
        )
        clip_path2 = try_to_load_from_cache(
            self.clip_model_2.repo_id, self.clip_model_2.path
        )

        if self.type == DualCLIPEnum.SDXL:
            clip_type = comfy.sd.CLIPType.STABLE_DIFFUSION
        elif self.type == DualCLIPEnum.SD3:
            clip_type = comfy.sd.CLIPType.SD3
        elif self.type == DualCLIPEnum.FLUX:
            clip_type = comfy.sd.CLIPType.FLUX

        clip = comfy.sd.load_clip(
            ckpt_paths=[clip_path1, clip_path2],
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
            clip_type=clip_type,
        )

        return {
            "clip": CLIP(
                name=self.clip_model_1.repo_id + "+" + self.clip_model_2.repo_id,
                model=clip,
            )
        }

    @classmethod
    def get_title(cls):
        return "Load Dual CLIP from Huggingface"

    @classmethod
    def return_type(cls):
        return {"clip": CLIP}


class WeightDataTypeEnum(str, Enum):
    DEFAULT = "default"
    FP8_E4M3FN = "fp8_e4m3fn"
    FP8_E4M3FN_FAST = "fp8_e4m3fn_fast"
    FP8_E5M2 = "fp8_e5m2"


class UNETLoader(ComfyNode):
    """
    Loads a UNet model.
    """

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

        return {"unet": UNet(name=self.unet_name.name, model=unet)}

    @classmethod
    def get_title(cls):
        return "Load Diffusion Model"

    @classmethod
    def return_type(cls):
        return {"unet": UNet}


class HuggingFaceUNetLoader(ComfyNode):
    """
    Loads a UNet model from Huggingface.
    """

    model: HFUnet = Field(
        default=HFUnet(),
        description="The UNet model to load.",
    )
    weight_dtype: WeightDataTypeEnum = Field(
        WeightDataTypeEnum.DEFAULT,
        description="The weight data type to use.",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFUnet]:
        return HF_UNET_MODELS

    @classmethod
    def get_title(cls):
        return "Load Diffusion Model from Huggingface"

    @classmethod
    def return_type(cls):
        return {"unet": UNet}

    async def process(self, context: ProcessingContext):
        if self.model.is_empty():
            raise Exception("UNet model must be selected.")

        if self.model.path is None:
            raise Exception("UNet path must be set.")

        unet_path = try_to_load_from_cache(self.model.repo_id, self.model.path)

        model_options = {}
        if self.weight_dtype == WeightDataTypeEnum.FP8_E4M3FN:
            model_options["dtype"] = torch.float8_e4m3fn
        elif self.weight_dtype == WeightDataTypeEnum.FP8_E4M3FN_FAST:
            model_options["dtype"] = torch.float8_e4m3fn
            model_options["fp8_optimizations"] = True
        elif self.weight_dtype == WeightDataTypeEnum.FP8_E5M2:
            model_options["dtype"] = torch.float8_e5m2

        unet = comfy.sd.load_diffusion_model(unet_path, model_options=model_options)

        return {"unet": UNet(name=self.model.repo_id, model=unet)}


class ImageOnlyCheckpointLoader(ComfyNode):
    """
    Loads a checkpoint for img2vid.
    """

    ckpt_name: str = Field(
        default="", description="The name of the checkpoint to load."
    )

    @classmethod
    def return_type(cls):
        return {"model": UNet, "clip_vision": CLIPVision, "vae": VAE}

    @classmethod
    def get_title(cls):
        return "Image Only Checkpoint Loader (img2vid model)"


class IPAdapterModelLoader(ComfyNode):
    """
    Loads an IPAdapter model.
    """

    ipadapter_file: IPAdapterFile = Field(
        default=IPAdapterFile(),
        description="List of available IPAdapter model names.",
    )

    @classmethod
    def return_type(cls):
        return {"ipadapter": IPAdapter}

    @classmethod
    def is_cacheable(cls):
        return False

    @classmethod
    def get_title(cls):
        return "Load IPAdapter"

    async def process(self, context: ProcessingContext):
        (ipadapter,) = await self.call_comfy_node(context)
        return {"ipadapter": IPAdapter(name=self.ipadapter_file.name, model=ipadapter)}


class HuggingFaceIPAdapterLoader(ComfyNode):
    """
    Loads an IPAdapter model from Huggingface.
    """

    ipadapter: HFIPAdapter = Field(
        default=HFIPAdapter(), description="The IPAdapter to load."
    )

    @classmethod
    def get_title(cls):
        return "Load IPAdapter from Huggingface"

    @classmethod
    def is_cacheable(cls):
        return False

    @classmethod
    def return_type(cls):
        return {"ipadapter": IPAdapter}

    @classmethod
    def get_recommended_models(cls):
        return HF_IP_ADAPTER_MODELS + HF_IP_ADAPTER_XL_MODELS

    async def process(self, context: ProcessingContext):
        assert self.ipadapter.is_set(), "IPAdapter must be set."
        assert self.ipadapter.path is not None, "IPAdapter path must be set."

        ckpt_path = try_to_load_from_cache(self.ipadapter.repo_id, self.ipadapter.path)

        assert (
            ckpt_path is not None
        ), "IPAdapter model must be downloaded from Huggingface."

        model = comfy.utils.load_torch_file(ckpt_path, safe_load=True)

        return {"ipadapter": IPAdapter(name=self.ipadapter.path, model=model)}


class StyleModelLoader(ComfyNode):
    """
    Loads a style model.
    """

    style_model_name: StyleModelFile = Field(
        default=StyleModelFile(), description="The name of the style model to load."
    )

    @classmethod
    def return_type(cls):
        return {"style_model": StyleModel}

    @classmethod
    def get_title(cls):
        return "Load Style Model"

    @classmethod
    def is_cacheable(cls):
        return False

    async def process(self, context: ProcessingContext):
        if self.style_model_name.is_empty():
            raise Exception("Style model name must be selected.")

        (style_model,) = await self.call_comfy_node(context)
        return {
            "style_model": StyleModel(
                name=self.style_model_name.name, model=style_model
            )
        }


class HuggingFaceStyleModelLoader(ComfyNode):
    """
    Loads a style model from HuggingFace.
    """

    model: HFStyleModel = Field(
        default=HFStyleModel(),
        description="The style model to load.",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFStyleModel]:
        return [
            HFStyleModel(
                repo_id="black-forest-labs/FLUX.1-Redux-dev",
                path="flux1-redux-dev.safetensors",
            ),
        ]

    @classmethod
    def get_title(cls):
        return "Load Style Model from Huggingface"

    @classmethod
    def is_cacheable(cls):
        return False

    @classmethod
    def return_type(cls):
        return {"style_model": StyleModel}

    async def process(self, context: ProcessingContext):
        if self.model.is_empty():
            raise Exception("Style model must be selected.")

        assert self.model.path is not None, "Model path must be set"

        style_model_path = try_to_load_from_cache(self.model.repo_id, self.model.path)
        assert style_model_path is not None, "Style model path not found."

        style_model = comfy.sd.load_style_model(style_model_path)

        return {"style_model": StyleModel(name=self.model.repo_id, model=style_model)}
