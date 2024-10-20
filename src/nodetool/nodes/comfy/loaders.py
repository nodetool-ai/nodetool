from enum import Enum
import comfy.sd
import comfy.controlnet
import comfy.utils
import comfy.clip_vision
from huggingface_hub import try_to_load_from_cache
from pydantic import Field, validator
import folder_paths
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
    HFCLIPVision,
    HFControlNet,
    HFIPAdapter,
    HFLoraSD,
    HFLoraSDXL,
    HFStableDiffusion,
    HFStableDiffusionXL,
    IPAdapter,
    IPAdapterFile,
    LORAFile,
    UNet,
    UNetFile,
    UpscaleModel,
    UpscaleModelFile,
    VAEFile,
    unCLIPFile,
)
from nodetool.common.comfy_node import ComfyNode
from nodetool.nodes.huggingface.lora import HF_LORA_SD_MODELS, HF_LORA_SDXL_MODELS
from nodetool.nodes.huggingface.stable_diffusion_base import (
    HF_IP_ADAPTER_MODELS,
    HF_IP_ADAPTER_XL_MODELS,
    HF_STABLE_DIFFUSION_MODELS,
    HF_STABLE_DIFFUSION_XL_MODELS,
)
from nodetool.nodes.huggingface.image_to_image import HF_CONTROLNET_MODELS
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
from nodetool.common.comfy_node import ComfyNode, MAX_RESOLUTION


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


class CheckpointLoaderNF4(CheckpointLoaderSimple):
    @classmethod
    def get_title(cls):
        return "Load Checkpoint (NF4)"

    async def process(self, context: ProcessingContext):
        if self.ckpt_name.is_empty():
            raise Exception("Checkpoint name must be selected.")

        unet, clip, vae = await self.call_comfy_node(context)

        return {
            "model": UNet(name=self.ckpt_name.name, model=unet),
            "clip": CLIP(name=self.ckpt_name.name, model=clip),
            "vae": VAE(name=self.ckpt_name.name, model=vae),
        }


class CheckpointLoader(CheckpointLoaderSimple):
    """
    Loads a checkpoint.
    """

    @classmethod
    def get_title(cls):
        return "Load Checkpoint (Advanced)"


class HuggingFaceCheckpointLoader(ComfyNode):
    model: HFStableDiffusion = Field(
        default=HFStableDiffusion(),
        description="The Stable Diffusion model to load.",
    )

    @classmethod
    def return_type(cls):
        return {"model": UNet, "clip": CLIP, "vae": VAE}

    @classmethod
    def get_title(cls):
        return "Load HuggingFace Checkpoint"

    @classmethod
    def get_recommended_models(cls) -> list[HFStableDiffusion]:
        return HF_STABLE_DIFFUSION_MODELS

    async def process(self, context: ProcessingContext):
        if self.model.is_empty():
            raise ValueError("Model repository ID must be selected.")

        assert self.model.path is not None, "Model path must be set."

        ckpt_path = try_to_load_from_cache(self.model.repo_id, self.model.path)

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


class HuggingFaceCheckpointLoaderXL(HuggingFaceCheckpointLoader):
    model: HFStableDiffusionXL = Field(
        default=HFStableDiffusionXL(),
        description="The Stable Diffusion XL model to load.",
    )

    @classmethod
    def get_title(cls):
        return "Load Hugging Face Checkpoint XL"

    @classmethod
    def get_recommended_models(cls) -> list[HFStableDiffusionXL]:
        return HF_STABLE_DIFFUSION_XL_MODELS


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
    model: HFCLIPVision = Field(
        default=HFCLIPVision(),
        description="The CLIP vision model to load.",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFCLIPVision]:
        return [
            HFCLIPVision(
                repo_id="h94/IP-Adapter",
                path="models/image_encoder/model.safetensors",
            ),
            HFCLIPVision(
                repo_id="h94/IP-Adapter",
                path="sdxl_models/image_encoder/model.safetensors",
            ),
        ]

    @classmethod
    def get_title(cls):
        return "Load HuggingFace CLIP Vision"

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

        clip_vision = comfy.clip_vision.load(clip_vision_path)

        return {
            "clip_vision": CLIPVision(name=self.model.repo_id, model=clip_vision),
        }


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
        if self.control_net_name.is_empty():
            raise Exception("ControlNet name must be selected.")
        (control_net,) = await self.call_comfy_node(context)
        return {
            "control_net": ControlNet(
                name=self.control_net_name.name, model=control_net
            )
        }


class HuggingFaceControlNetLoader(ComfyNode):
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
        return "Load HuggingFace ControlNet"

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
    def get_recommended_models(cls) -> list[HFLoraSD]:
        return HF_LORA_SD_MODELS

    @classmethod
    def get_title(cls):
        return "Load HuggingFace LoRA"

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


class HuggingFaceLoraLoaderXL(HuggingFaceLoraLoader):
    lora: HFLoraSDXL = Field(
        default=HFLoraSDXL(),
        description="The LoRA to load.",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFLoraSDXL]:
        return HF_LORA_SDXL_MODELS

    @classmethod
    def get_title(cls):
        return "Load HuggingFace LoRA XL"


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
        return {"model": UNet}

    async def process(self, context: ProcessingContext):
        if self.lora_name.name == "":
            raise Exception("LoRA name must be selected.")

        (model,) = await self.call_comfy_node(context)

        return {
            "model": UNet(name=self.lora_name.name, model=model),
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
        return {"vae": VAE(name=self.vae_name.name, model=vae)}


class CLIPLoader(ComfyNode):
    clip_name: CLIPFile = Field(
        default=CLIPFile(),
        description="The name of the CLIP to load.",
    )

    async def process(self, context: ProcessingContext):
        if self.clip_name.name == "":
            raise Exception("CLIP name must be selected")

        (clip,) = await self.call_comfy_node(context)
        return {"clip": CLIP(name=self.clip_name.name, model=clip)}

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

        return {"clip": CLIP(name=self.clip_name1.name, model=clip)}

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

        return {"unet": UNet(name=self.unet_name.name, model=unet)}

    @classmethod
    def get_title(cls):
        return "Load Diffusion Model"

    @classmethod
    def return_type(cls):
        return {"unet": UNet}


class ImageOnlyCheckpointLoader(ComfyNode):
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
    ipadapter: HFIPAdapter = Field(
        default=HFIPAdapter(), description="The IPAdapter to load."
    )

    @classmethod
    def get_title(cls):
        return "Load HuggingFace IPAdapter"

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

        assert ckpt_path is not None, "IPAdapter path not found."

        model = comfy.utils.load_torch_file(ckpt_path, safe_load=True)

        return {"ipadapter": IPAdapter(name=self.ipadapter.path, model=model)}
