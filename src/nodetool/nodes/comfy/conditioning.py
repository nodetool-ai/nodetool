from enum import Enum
from pydantic import Field, validator
from nodetool.metadata.types import (
    CLIP,
    GLIGEN,
    VAE,
    CLIPFile,
    CLIPVision,
    CLIPVisionOutput,
    Conditioning,
    ControlNet,
    ImageTensor,
    LORAFile,
    Mask,
    UNet,
    VAEFile,
)
from nodetool.nodes.comfy import MAX_RESOLUTION, ComfyNode


class CLIPTextEncode(ComfyNode):
    text: str = Field(default="", description="The prompt to use.")
    clip: CLIP = Field(default=CLIP(), description="The CLIP model to use.")

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class ConditioningCombine(ComfyNode):
    conditioning_1: Conditioning = Field(
        default=Conditioning(), description="The first conditioning input."
    )
    conditioning_2: Conditioning = Field(
        default=Conditioning(), description="The second conditioning input."
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class ConditioningAverage(ComfyNode):
    conditioning_to: Conditioning = Field(
        default=Conditioning(), description="The target conditioning."
    )
    conditioning_from: Conditioning = Field(
        default=Conditioning(), description="The source conditioning."
    )
    conditioning_to_strength: float = Field(
        default=1.0, description="The strength of the target conditioning."
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class ConditioningConcat(ComfyNode):
    conditioning_to: Conditioning = Field(
        default=Conditioning(), description="The conditioning to concatenate to."
    )
    conditioning_from: Conditioning = Field(
        default=Conditioning(), description="The conditioning to concatenate from."
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class ConditioningSetArea(ComfyNode):
    conditioning: Conditioning = Field(
        default=Conditioning(), description="The conditioning to modify."
    )
    width: int = Field(
        default=64,
        description="The width of the area.",
        ge=64,  # ge is 'greater than or equal to'
        le=MAX_RESOLUTION,
        multiple_of=8,
    )
    height: int = Field(
        default=64,
        description="The height of the area.",
        ge=64,
        le=MAX_RESOLUTION,
        multiple_of=8,
    )
    x: int = Field(
        default=0,
        description="The x-coordinate of the top-left corner of the area.",
        ge=0,
        le=MAX_RESOLUTION,
        multiple_of=8,
    )
    y: int = Field(
        default=0,
        description="The y-coordinate of the top-left corner of the area.",
        ge=0,
        le=MAX_RESOLUTION,
        multiple_of=8,
    )
    strength: float = Field(
        default=1.0,
        description="The strength of the conditioning in the set area.",
        ge=0.0,
        le=10.0,
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class ConditioningSetAreaPercentage(ComfyNode):
    conditioning: Conditioning = Field(
        default=Conditioning(), description="The conditioning to modify."
    )
    width: float = Field(
        default=1.0,
        description="The width of the area as a percentage of the total width.",
        ge=0.0,  # ge is 'greater than or equal to'
        le=1.0,
    )
    height: float = Field(
        default=1.0,
        description="The height of the area as a percentage of the total height.",
        ge=0.0,
        le=1.0,
    )
    x: float = Field(
        default=0.0,
        description="The x-coordinate of the top-left corner of the area as a percentage.",
        ge=0.0,
        le=1.0,
    )
    y: float = Field(
        default=0.0,
        description="The y-coordinate of the top-left corner of the area as a percentage.",
        ge=0.0,
        le=1.0,
    )
    strength: float = Field(
        default=1.0,
        description="The strength of the conditioning in the set area.",
        ge=0.0,
        le=10.0,
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class SetConditioningAreaEnum(str, Enum):
    DEFAULT = "default"
    MASK_BOUNDS = "mask bounds"


class ConditioningSetMask(ComfyNode):
    conditioning: Conditioning = Field(
        default=Conditioning(), description="The conditioning to modify."
    )
    mask: Mask = Field(
        default=Mask(), description="The mask to use for setting the conditioning."
    )
    strength: float = Field(
        default=1.0,
        description="The strength of the conditioning within the mask.",
        ge=0.0,  # ge is 'greater than or equal to'
        le=10.0,
    )
    set_cond_area: SetConditioningAreaEnum = Field(
        default=SetConditioningAreaEnum.DEFAULT,
        description="Method to determine the area for setting conditioning.",
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class ConditioningZeroOut(ComfyNode):
    conditioning: Conditioning = Field(
        default=Conditioning(), description="The conditioning to be zeroed out."
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class ConditioningSetTimestepRange(ComfyNode):
    conditioning: Conditioning = Field(
        default=Conditioning(), description="The conditioning to set timestep range."
    )
    start: float = Field(
        default=0.0,
        description="The start of the timestep range.",
        ge=0.0,  # ge is 'greater than or equal to'
        le=1.0,  # le is 'less than or equal to'
    )
    end: float = Field(
        default=1.0, description="The end of the timestep range.", ge=0.0, le=1.0
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class CLIPVisionEncode(ComfyNode):
    clip_vision: CLIPVision = Field(
        default=CLIPVision(),
        description="The CLIP vision model to use for encoding.",
    )
    image: ImageTensor = Field(
        default=ImageTensor(),
        description="The image to encode with the CLIP vision model.",
    )

    @classmethod
    def return_type(cls):
        return {"clip_vision_output": CLIPVisionOutput}


class CLIPSetLastLayer(ComfyNode):
    clip: CLIP = Field(default=CLIP(), description="The CLIP model to modify.")
    stop_at_clip_layer: int = Field(
        default=-1,
        description="The index of the last CLIP layer to use.",
        ge=-24,  # ge is 'greater than or equal to'
        le=-1,  # le is 'less than or equal to'
    )

    @classmethod
    def return_type(cls):
        return {"clip": CLIP}


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

    @validator("lora_name", pre=True)
    def validate_lora_name(cls, v):
        if isinstance(v, str):
            v = LORAFile(name=v)
        if isinstance(v, dict):
            v = LORAFile(**v)
        if v.name == "":
            raise ValueError("The checkpoint name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {
            "model": UNet,
            "clip": CLIP,
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

    @validator("lora_name", pre=True)
    def validate_lora_name(cls, v):
        if isinstance(v, str):
            v = LORAFile(name=v)
        if isinstance(v, dict):
            v = LORAFile(**v)
        if v.name == "":
            raise ValueError("The checkpoint name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {"unet": UNet}


class VAELoader(ComfyNode):
    vae_name: VAEFile = Field(
        default=VAEFile(), description="The name of the VAE to load."
    )

    @validator("vae_name", pre=True)
    def validate_vae_name(cls, v):
        if isinstance(v, str):
            v = VAEFile(name=v)
        if isinstance(v, dict):
            v = VAEFile(**v)
        if v.name == "":
            raise ValueError("The file name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {"vae": VAE}


class CLIPLoader(ComfyNode):
    clip_name: CLIPFile = Field(
        default=CLIPFile(),
        description="The name of the CLIP to load.",
    )

    @validator("clip_name", pre=True)
    def validate_clip_name(cls, v):
        if isinstance(v, str):
            v = CLIPFile(name=v)
        if isinstance(v, dict):
            v = CLIPFile(**v)
        if v.name == "":
            raise ValueError("The file name cannot be empty.")
        return v

    @classmethod
    def return_type(cls):
        return {"clip": CLIP}


class DualCLIPLoader(ComfyNode):
    clip_name1: CLIPFile = Field(
        default=CLIPFile(),
        description="The name of the CLIP to load.",
    )
    clip_name2: CLIPFile = Field(
        default=CLIPFile(),
        description="The name of the CLIP to load.",
    )

    @validator("clip_name1", pre=True)
    def validate_clip_name1(cls, v):
        if isinstance(v, str):
            v = CLIPFile(name=v)
        if isinstance(v, dict):
            v = CLIPFile(**v)
        if v.name == "":
            raise ValueError("The file name cannot be empty.")
        return v

    @validator("clip_name2", pre=True)
    def validate_clip_name2(cls, v):
        if isinstance(v, str):
            v = CLIPFile(name=v)
        if isinstance(v, dict):
            v = CLIPFile(**v)
        if v.name == "":
            raise ValueError("The file name cannot be empty.")
        return v

    @classmethod
    def return_types(cls):
        return {"clip": CLIP}


class ControlNetApply(ComfyNode):
    conditioning: Conditioning = Field(
        default=Conditioning(), description="The conditioning to apply."
    )
    control_net: ControlNet = Field(
        default=ControlNet(), description="The control net to apply."
    )
    image: ImageTensor = Field(default="", description="The image to apply to.")
    strength: float = Field(
        default=1.0, description="The strength of the controlnet.", gt=0.0, lt=10.0
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class ControlNetApplyAdvanced(ComfyNode):
    positive: Conditioning = Field(
        default=Conditioning(), description="The positive conditioning to apply."
    )
    negative: Conditioning = Field(
        default=Conditioning(), description="The negative conditioning to apply."
    )
    control_net: ControlNet = Field(
        default=ControlNet(), description="The ControlNet to use."
    )
    image: ImageTensor = Field(
        default=ImageTensor(),
        description="The image to apply conditioning adjustments to.",
    )
    strength: float = Field(
        default=1.0,
        description="The strength of conditioning.",
        ge=0.0,  # ge is 'greater than or equal to'
        le=10.0,  # le is 'less than or equal to'
    )
    start_percent: float = Field(
        default=0.0,
        description="The start percentage from which to apply conditioning.",
        ge=0.0,
        le=1.0,
    )
    end_percent: float = Field(
        default=1.0,
        description="The end percentage until which to apply conditioning.",
        ge=0.0,
        le=1.0,
    )

    @classmethod
    def return_types(cls):
        # Since there are two return values, a tuple of ConditioningRef should be provided with appropriate names matching RETURN_NAMES.
        return (Conditioning, Conditioning)


class unCLIPConditioning(ComfyNode):
    conditioning: Conditioning = Field(
        default=Conditioning(), description="The conditioning to modify."
    )
    clip_vision_output: CLIPVisionOutput = Field(
        default=CLIPVisionOutput(),
        description="The CLIP vision output to associate.",
    )
    strength: float = Field(
        default=1.0,
        description="The strength of the association with the CLIP vision output.",
        ge=-10.0,  # ge is 'greater than or equal to'
        le=10.0,  # le is 'less than or equal to'
    )
    noise_augmentation: float = Field(
        default=0.0,
        description="The amount of noise augmentation to apply.",
        ge=0.0,
        le=1.0,
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class GLIGENTextBoxApply(ComfyNode):
    conditioning_to: Conditioning = Field(
        default=Conditioning(), description="The input conditioning to modify."
    )
    clip: CLIP = Field(default=CLIP(), description="The CLIP instance to use.")
    gligen_textbox_model: GLIGEN = Field(
        default=GLIGEN(), description="The GLIGEN textbox model to apply."
    )
    text: str = Field(
        default="",
        description="The text to apply.",
    )
    width: int = Field(
        default=64,
        description="The width of the text box.",
        ge=8,
        le=MAX_RESOLUTION,
        multiple_of=8,
    )
    height: int = Field(
        default=64,
        description="The height of the text box.",
        ge=8,
        le=MAX_RESOLUTION,
        multiple_of=8,
    )
    x: int = Field(
        default=0,
        description="The x position of the text box.",
        ge=0,
        le=MAX_RESOLUTION,
        multiple_of=8,
    )
    y: int = Field(
        default=0,
        description="The y position of the text box.",
        ge=0,
        le=MAX_RESOLUTION,
        multiple_of=8,
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}
