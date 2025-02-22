from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.comfy.loaders

class CLIPLoader(GraphNode):
    """
    Loads a CLIP model.
    """

    CLIPTypeEnum: typing.ClassVar[type] = nodetool.nodes.comfy.loaders.CLIPLoader.CLIPTypeEnum
    clip_name: CLIPFile | GraphNode | tuple[GraphNode, str] = Field(default=CLIPFile(type='comfy.clip_file', name=''), description='The name of the CLIP to load.')
    type: nodetool.nodes.comfy.loaders.CLIPLoader.CLIPTypeEnum = Field(default=CLIPTypeEnum.STABLE_DIFFUSION, description='The type of the CLIP model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.CLIPLoader"



class CLIPVisionLoader(GraphNode):
    """
    Loads a CLIPVision model.
    """

    clip_name: CLIPVisionFile | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVisionFile(type='comfy.clip_vision_file', name=''), description='The name of the CLIP vision model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.CLIPVisionLoader"



class CheckpointLoader(GraphNode):
    """
    Loads a checkpoint.
    """

    ckpt_name: CheckpointFile | GraphNode | tuple[GraphNode, str] = Field(default=CheckpointFile(type='comfy.checkpoint_file', name=''), description='The checkpoint to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.CheckpointLoader"



class CheckpointLoaderSimple(GraphNode):
    """
    Loads a checkpoint.
    """

    ckpt_name: CheckpointFile | GraphNode | tuple[GraphNode, str] = Field(default=CheckpointFile(type='comfy.checkpoint_file', name=''), description='The checkpoint to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.CheckpointLoaderSimple"



class ControlNetLoader(GraphNode):
    """
    Loads a ControlNet model.
    """

    control_net_name: ControlNetFile | GraphNode | tuple[GraphNode, str] = Field(default=ControlNetFile(type='comfy.control_net_file', name=''), description='The filename of the control net to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.ControlNetLoader"


import nodetool.nodes.comfy.loaders

class DualCLIPLoader(GraphNode):
    """
    Loads a dual CLIP model.
    """

    DualCLIPEnum: typing.ClassVar[type] = nodetool.nodes.comfy.loaders.DualCLIPLoader.DualCLIPEnum
    clip_name1: CLIPFile | GraphNode | tuple[GraphNode, str] = Field(default=CLIPFile(type='comfy.clip_file', name=''), description='The name of the CLIP to load.')
    clip_name2: CLIPFile | GraphNode | tuple[GraphNode, str] = Field(default=CLIPFile(type='comfy.clip_file', name=''), description='The name of the CLIP to load.')
    type: nodetool.nodes.comfy.loaders.DualCLIPLoader.DualCLIPEnum = Field(default=DualCLIPEnum.SDXL, description='The type of the dual CLIP model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.DualCLIPLoader"



class GLIGENLoader(GraphNode):
    """
    Loads a GLIGEN model.
    """

    gligen_name: GLIGENFile | GraphNode | tuple[GraphNode, str] = Field(default=GLIGENFile(type='comfy.gligen_file', name=''), description='The GLIGEN checkpoint to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.GLIGENLoader"


import nodetool.nodes.comfy.loaders

class HuggingFaceCLIPLoader(GraphNode):
    """
    Loads a CLIP model from Huggingface.
    """

    CLIPTypeEnum: typing.ClassVar[type] = nodetool.nodes.comfy.loaders.HuggingFaceCLIPLoader.CLIPTypeEnum
    model: HFCLIP | GraphNode | tuple[GraphNode, str] = Field(default=HFCLIP(type='hf.clip', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The CLIP model to load.')
    type: nodetool.nodes.comfy.loaders.HuggingFaceCLIPLoader.CLIPTypeEnum = Field(default=CLIPTypeEnum.STABLE_DIFFUSION, description='The type of the CLIP model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.HuggingFaceCLIPLoader"



class HuggingFaceCLIPVisionLoader(GraphNode):
    """
    Loads a CLIPVision model from Huggingface.
    """

    model: HFCLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=HFCLIPVision(type='hf.clip_vision', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The CLIP vision model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.HuggingFaceCLIPVisionLoader"



class HuggingFaceCheckpointLoader(GraphNode):
    """
    Loads a checkpoint from Huggingface.
    """

    model: HFCheckpointModel | GraphNode | tuple[GraphNode, str] = Field(default=HFCheckpointModel(type='hf.checkpoint_model', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The Stable Diffusion model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.HuggingFaceCheckpointLoader"



class HuggingFaceControlNetLoader(GraphNode):
    """
    Loads a ControlNet model from Huggingface.
    """

    model: HFControlNet | GraphNode | tuple[GraphNode, str] = Field(default=HFControlNet(type='hf.controlnet', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The ControlNet model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.HuggingFaceControlNetLoader"


import nodetool.nodes.comfy.loaders

class HuggingFaceDualCLIPLoader(GraphNode):
    """
    Loads a dual CLIP model from Huggingface.
    """

    DualCLIPEnum: typing.ClassVar[type] = nodetool.nodes.comfy.loaders.HuggingFaceDualCLIPLoader.DualCLIPEnum
    type: nodetool.nodes.comfy.loaders.HuggingFaceDualCLIPLoader.DualCLIPEnum = Field(default=DualCLIPEnum.SDXL, description='The type of the dual CLIP model to load.')
    clip_model_1: HFCLIP | GraphNode | tuple[GraphNode, str] = Field(default=HFCLIP(type='hf.clip', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The first CLIP model to load.')
    clip_model_2: HFCLIP | GraphNode | tuple[GraphNode, str] = Field(default=HFCLIP(type='hf.clip', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The second CLIP model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.HuggingFaceDualCLIPLoader"



class HuggingFaceIPAdapterLoader(GraphNode):
    """
    Loads an IPAdapter model from Huggingface.
    """

    ipadapter: HFIPAdapter | GraphNode | tuple[GraphNode, str] = Field(default=HFIPAdapter(type='hf.ip_adapter', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The IPAdapter to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.HuggingFaceIPAdapterLoader"



class HuggingFaceLoraLoader(GraphNode):
    """
    Loads a LoRA model from Huggingface.
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to apply LoRA to.')
    clip: CLIP | GraphNode | tuple[GraphNode, str] = Field(default=CLIP(type='comfy.clip', name='', model=None), description='The CLIP model to apply LoRA to.')
    lora: HFLoraSD | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSD(type='hf.lora_sd', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The LoRA to load.')
    strength_model: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the LoRA to apply to the model.')
    strength_clip: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the LoRA to apply to the CLIP.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.HuggingFaceLoraLoader"



class HuggingFaceStyleModelLoader(GraphNode):
    """
    Loads a style model from HuggingFace.
    """

    model: HFStyleModel | GraphNode | tuple[GraphNode, str] = Field(default=HFStyleModel(type='hf.style_model', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The style model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.HuggingFaceStyleModelLoader"


import nodetool.nodes.comfy.loaders

class HuggingFaceUNetLoader(GraphNode):
    """
    Loads a UNet model from Huggingface.
    """

    WeightDataTypeEnum: typing.ClassVar[type] = nodetool.nodes.comfy.loaders.HuggingFaceUNetLoader.WeightDataTypeEnum
    model: HFUnet | GraphNode | tuple[GraphNode, str] = Field(default=HFUnet(type='hf.unet', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The UNet model to load.')
    weight_dtype: nodetool.nodes.comfy.loaders.HuggingFaceUNetLoader.WeightDataTypeEnum = Field(default=WeightDataTypeEnum.DEFAULT, description='The weight data type to use.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.HuggingFaceUNetLoader"



class HuggingFaceVAELoader(GraphNode):
    """
    Loads a VAE model from Huggingface.
    """

    model: HFVAE | GraphNode | tuple[GraphNode, str] = Field(default=HFVAE(type='hf.vae', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The VAE model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.HuggingFaceVAELoader"



class IPAdapterModelLoader(GraphNode):
    """
    Loads an IPAdapter model.
    """

    ipadapter_file: IPAdapterFile | GraphNode | tuple[GraphNode, str] = Field(default=IPAdapterFile(type='comfy.ip_adapter_file', name=''), description='List of available IPAdapter model names.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.IPAdapterModelLoader"



class ImageOnlyCheckpointLoader(GraphNode):
    """
    Loads a checkpoint for img2vid.
    """

    ckpt_name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the checkpoint to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.ImageOnlyCheckpointLoader"



class LoraLoader(GraphNode):
    """
    Loads a LoRA model.
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to apply Lora to.')
    clip: CLIP | GraphNode | tuple[GraphNode, str] = Field(default=CLIP(type='comfy.clip', name='', model=None), description='The CLIP model to apply Lora to.')
    lora_name: LORAFile | GraphNode | tuple[GraphNode, str] = Field(default=LORAFile(type='comfy.lora_file', name=''), description='The name of the LoRA to load.')
    strength_model: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the LoRA to apply to the model.')
    strength_clip: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the LoRA to apply to the CLIP.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.LoraLoader"



class LoraLoaderModelOnly(GraphNode):
    """
    Loads a LoRA model (model only).
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to apply Lora to.')
    lora_name: LORAFile | GraphNode | tuple[GraphNode, str] = Field(default=LORAFile(type='comfy.lora_file', name=''), description='The name of the LoRA to load.')
    strength_model: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the LoRA to apply to the model.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.LoraLoaderModelOnly"



class StyleModelLoader(GraphNode):
    """
    Loads a style model.
    """

    style_model_name: StyleModelFile | GraphNode | tuple[GraphNode, str] = Field(default=StyleModelFile(type='comfy.style_model_file', name=''), description='The name of the style model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.StyleModelLoader"


import nodetool.nodes.comfy.loaders

class UNETLoader(GraphNode):
    """
    Loads a UNet model.
    """

    WeightDataTypeEnum: typing.ClassVar[type] = nodetool.nodes.comfy.loaders.UNETLoader.WeightDataTypeEnum
    unet_name: UNetFile | GraphNode | tuple[GraphNode, str] = Field(default=UNetFile(type='comfy.unet_file', name=''), description='The name of the UNet model to load.')
    weight_dtype: nodetool.nodes.comfy.loaders.UNETLoader.WeightDataTypeEnum = Field(default=WeightDataTypeEnum.DEFAULT, description='The weight data type to use.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.UNETLoader"



class UpscaleModelLoader(GraphNode):
    """
    Loads an upscale model.
    """

    model_name: UpscaleModelFile | GraphNode | tuple[GraphNode, str] = Field(default=UpscaleModelFile(type='comfy.upscale_model_file', name=''), description='The filename of the upscale model to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.UpscaleModelLoader"



class VAELoader(GraphNode):
    """
    Loads a VAE model.
    """

    vae_name: VAEFile | GraphNode | tuple[GraphNode, str] = Field(default=VAEFile(type='comfy.vae_file', name=''), description='The name of the VAE to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.VAELoader"



class unCLIPCheckpointLoader(GraphNode):
    """
    Loads a unCLIP checkpoint.
    """

    ckpt_name: unCLIPFile | GraphNode | tuple[GraphNode, str] = Field(default=unCLIPFile(type='comfy.unclip_file', name=''), description='The checkpoint to load.')

    @classmethod
    def get_node_type(cls): return "comfy.loaders.unCLIPCheckpointLoader"


