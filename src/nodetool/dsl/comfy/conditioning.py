from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CLIPLoader(GraphNode):
    clip_name: CLIPFile | GraphNode | tuple[GraphNode, str] = Field(default=CLIPFile(type='comfy.clip_file', name=''), description='The name of the CLIP to load.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.CLIPLoader"



class CLIPSetLastLayer(GraphNode):
    clip: CLIP | GraphNode | tuple[GraphNode, str] = Field(default=CLIP(type='comfy.clip'), description='The CLIP model to modify.')
    stop_at_clip_layer: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The index of the last CLIP layer to use.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.CLIPSetLastLayer"



class CLIPTextEncode(GraphNode):
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    clip: CLIP | GraphNode | tuple[GraphNode, str] = Field(default=CLIP(type='comfy.clip'), description='The CLIP model to use.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.CLIPTextEncode"



class CLIPVisionEncode(GraphNode):
    clip_vision: CLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVision(type='comfy.clip_vision'), description='The CLIP vision model to use for encoding.')
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to encode with the CLIP vision model.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.CLIPVisionEncode"



class ConditioningAverage(GraphNode):
    conditioning_to: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The target conditioning.')
    conditioning_from: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The source conditioning.')
    conditioning_to_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the target conditioning.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningAverage"



class ConditioningCombine(GraphNode):
    conditioning_1: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The first conditioning input.')
    conditioning_2: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The second conditioning input.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningCombine"



class ConditioningConcat(GraphNode):
    conditioning_to: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The conditioning to concatenate to.')
    conditioning_from: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The conditioning to concatenate from.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningConcat"



class ConditioningSetArea(GraphNode):
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The conditioning to modify.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=64, description='The width of the area.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=64, description='The height of the area.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x-coordinate of the top-left corner of the area.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y-coordinate of the top-left corner of the area.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the conditioning in the set area.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningSetArea"



class ConditioningSetAreaPercentage(GraphNode):
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The conditioning to modify.')
    width: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The width of the area as a percentage of the total width.')
    height: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The height of the area as a percentage of the total height.')
    x: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The x-coordinate of the top-left corner of the area as a percentage.')
    y: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The y-coordinate of the top-left corner of the area as a percentage.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the conditioning in the set area.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningSetAreaPercentage"


from nodetool.nodes.comfy.conditioning import SetConditioningAreaEnum

class ConditioningSetMask(GraphNode):
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The conditioning to modify.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask'), description='The mask to use for setting the conditioning.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the conditioning within the mask.')
    set_cond_area: SetConditioningAreaEnum | GraphNode | tuple[GraphNode, str] = Field(default=SetConditioningAreaEnum('default'), description='Method to determine the area for setting conditioning.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningSetMask"



class ConditioningSetTimestepRange(GraphNode):
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The conditioning to set timestep range.')
    start: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start of the timestep range.')
    end: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The end of the timestep range.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningSetTimestepRange"



class ConditioningZeroOut(GraphNode):
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The conditioning to be zeroed out.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningZeroOut"



class ControlNetApply(GraphNode):
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The conditioning to apply.')
    control_net: ControlNet | GraphNode | tuple[GraphNode, str] = Field(default=ControlNet(type='comfy.control_net'), description='The control net to apply.')
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default='', description='The image to apply to.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the controlnet.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ControlNetApply"



class ControlNetApplyAdvanced(GraphNode):
    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The positive conditioning to apply.')
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The negative conditioning to apply.')
    control_net: ControlNet | GraphNode | tuple[GraphNode, str] = Field(default=ControlNet(type='comfy.control_net'), description='The ControlNet to use.')
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to apply conditioning adjustments to.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of conditioning.')
    start_percent: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start percentage from which to apply conditioning.')
    end_percent: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The end percentage until which to apply conditioning.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ControlNetApplyAdvanced"



class DualCLIPLoader(GraphNode):
    clip_name1: CLIPFile | GraphNode | tuple[GraphNode, str] = Field(default=CLIPFile(type='comfy.clip_file', name=''), description='The name of the CLIP to load.')
    clip_name2: CLIPFile | GraphNode | tuple[GraphNode, str] = Field(default=CLIPFile(type='comfy.clip_file', name=''), description='The name of the CLIP to load.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.DualCLIPLoader"



class GLIGENTextBoxApply(GraphNode):
    conditioning_to: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The input conditioning to modify.')
    clip: CLIP | GraphNode | tuple[GraphNode, str] = Field(default=CLIP(type='comfy.clip'), description='The CLIP instance to use.')
    gligen_textbox_model: GLIGEN | GraphNode | tuple[GraphNode, str] = Field(default=GLIGEN(type='comfy.gligen'), description='The GLIGEN textbox model to apply.')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to apply.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=64, description='The width of the text box.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=64, description='The height of the text box.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x position of the text box.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y position of the text box.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.GLIGENTextBoxApply"



class LoraLoader(GraphNode):
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet'), description='The model to apply Lora to.')
    clip: CLIP | GraphNode | tuple[GraphNode, str] = Field(default=CLIP(type='comfy.clip'), description='The CLIP model to apply Lora to.')
    lora_name: LORAFile | GraphNode | tuple[GraphNode, str] = Field(default=LORAFile(type='comfy.lora_file', name=''), description='The name of the LoRA to load.')
    strength_model: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the LoRA to apply to the model.')
    strength_clip: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the LoRA to apply to the CLIP.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.LoraLoader"



class LoraLoaderModelOnly(GraphNode):
    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet'), description='The model to apply Lora to.')
    lora_name: LORAFile | GraphNode | tuple[GraphNode, str] = Field(default=LORAFile(type='comfy.lora_file', name=''), description='The name of the LoRA to load.')
    strength_model: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the LoRA to apply to the model.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.LoraLoaderModelOnly"



class VAELoader(GraphNode):
    vae_name: VAEFile | GraphNode | tuple[GraphNode, str] = Field(default=VAEFile(type='comfy.vae_file', name=''), description='The name of the VAE to load.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.VAELoader"



class unCLIPConditioning(GraphNode):
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning'), description='The conditioning to modify.')
    clip_vision_output: CLIPVisionOutput | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVisionOutput(type='comfy.clip_vision_output'), description='The CLIP vision output to associate.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the association with the CLIP vision output.')
    noise_augmentation: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of noise augmentation to apply.')
    @classmethod
    def get_node_type(cls): return "comfy.conditioning.unCLIPConditioning"


