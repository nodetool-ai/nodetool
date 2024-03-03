from enum import Enum
from types import NoneType
import numpy as np
from pydantic import BaseModel, Field, GetCoreSchemaHandler


from typing import Any, Literal, Optional, Type, Union

from pydantic_core import CoreSchema
from pydantic_core.core_schema import StringSchema
from genflow.models.asset import Asset


# Mapping of python types to their string representation
TypeToName = {}
NameToType = {}


def add_type_name(type: Type, name: str):
    """
    Adds a type name to the TypeToEnum and EnumToType mappings.
    """
    TypeToName[type] = name
    NameToType[name] = type


def add_type_names(types):
    """
    Add type names to the TypeToEnum and EnumToType mappings.
    """
    for type, name in types.items():
        add_type_name(type, name)


# Add the default type names
add_type_names(
    {
        Any: "any",
        NoneType: "none",
        list: "list",
        dict: "dict",
        int: "int",
        float: "float",
        bool: "bool",
        str: "str",
        Enum: "enum",
        Union: "union",
    }
)


class GenflowType(BaseModel):
    """
    This is the base class for all Genflow types.

    It is used to create a mapping of type names to their corresponding classes.
    """

    type: str

    @classmethod
    def __init_subclass__(cls):
        """
        This method is called when a subclass of GenflowType is created.
        We remember the mapping of the subclass to its type name,
        so that we can use it later to create instances of the subclass from the type name.
        """
        super().__init_subclass__()
        if hasattr(cls, "type"):
            add_type_name(cls, cls.type)


asset_types = set()

class AssetRef(GenflowType):
    type: str = "asset"
    uri: str = ""
    asset_id: str | None = None

    def to_dict(self):
        return {
            "uri": self.uri,
            "asset_id": self.asset_id,
        }

    def is_empty(self):
        return self.uri == "" and self.asset_id is None
    
    @classmethod
    def __init_subclass__(cls):
        super().__init_subclass__()
        if hasattr(cls, "type"):
            asset_types.add(cls.type)
    


class FolderRef(AssetRef):
    type: Literal["folder"] = "folder"


class ModelRef(AssetRef):
    type: Literal["model_ref"] = "model_ref"


class VideoRef(AssetRef):
    type: Literal["video"] = "video"
    duration: Optional[float] = None  # Duration in seconds
    format: Optional[str] = None


class TextRef(AssetRef):
    type: Literal["text"] = "text"


class AudioRef(AssetRef):
    type: Literal["audio"] = "audio"


class AssistantRef(GenflowType):
    type: Literal["assistant"] = "assistant"
    id: str = ""


class FileRef(GenflowType):
    type: Literal["file"] = "file"


class ModelFile(GenflowType):
    name: str = ""


class CheckpointFile(ModelFile):
    type: Literal["comfy.checkpoint_file"] = "comfy.checkpoint_file"


class CLIPFile(ModelFile):
    type: Literal["comfy.clip_file"] = "comfy.clip_file"


class CLIPVisionFile(ModelFile):
    type: Literal["comfy.clip_vision_file"] = "comfy.clip_vision_file"


class ControlNetFile(ModelFile):
    type: Literal["comfy.control_net_file"] = "comfy.control_net_file"


class IPAdapterFile(ModelFile):
    type: Literal["comfy.ip_adapter_file"] = "comfy.ip_adapter_file"


class UpscaleModelFile(ModelFile):
    type: Literal["comfy.upscale_model_file"] = "comfy.upscale_model_file"


class CLIP(GenflowType):
    type: Literal["comfy.clip"] = "comfy.clip"


class CLIPVision(GenflowType):
    type: Literal["comfy.clip_vision"] = "comfy.clip_vision"


class CLIPVisionOutput(GenflowType):
    type: Literal["comfy.clip_vision_output"] = "comfy.clip_vision_output"


class GLIGEN(GenflowType):
    type: Literal["comfy.gligen"] = "comfy.gligen"


class Conditioning(GenflowType):
    type: Literal["comfy.conditioning"] = "comfy.conditioning"


class Latent(GenflowType):
    type: Literal["comfy.latent"] = "comfy.latent"


class ControlNet(GenflowType):
    type: Literal["comfy.control_net"] = "comfy.control_net"


class VAE(GenflowType):
    type: Literal["comfy.vae"] = "comfy.vae"


class UNet(GenflowType):
    type: Literal["comfy.unet"] = "comfy.unet"


class ImageTensor(GenflowType):
    type: Literal["comfy.image_tensor"] = "comfy.image_tensor"


class UpscaleModel(GenflowType):
    type: Literal["comfy.upscale_model"] = "comfy.upscale_model"


class LORA(GenflowType):
    type: Literal["comfy.lora"] = "comfy.lora"


class IPAdapter(GenflowType):
    type: Literal["comfy.ip_adapter"] = "comfy.ip_adapter"


class InsightFace(GenflowType):
    type: Literal["comfy.insight_face"] = "comfy.insight_face"


class Mask(GenflowType):
    type: Literal["comfy.mask"] = "comfy.mask"


class Sigmas(GenflowType):
    type: Literal["comfy.sigmas"] = "comfy.sigmas"


class Sampler(GenflowType):
    type: Literal["comfy.sampler"] = "comfy.sampler"


class Embeds(GenflowType):
    type: Literal["comfy.embeds"] = "comfy.embeds"


class MessageTextContent(GenflowType):
    type: Literal["message_text_content"] = "message_text_content"
    text: str = ""


class ImageRef(AssetRef):
    """A reference to an image asset."""

    type: Literal["image"] = "image"


class MessageImageContent(GenflowType):
    type: Literal["message_image_content"] = "message_image_content"
    image: ImageRef = ImageRef()


MessageContent = MessageTextContent | MessageImageContent


class ThreadMessage(GenflowType):
    type: Literal["thread_message"] = "thread_message"
    id: str = ""
    role: Literal["user", "assistant"] = "user"
    content: list[MessageContent] = []


class Thread(GenflowType):
    type: Literal["thread"] = "thread"
    id: str = ""


class Tensor(GenflowType):
    type: Literal["tensor"] = "tensor"
    value: list[Any] = []
    dtype: Optional[str] = None

    def to_numpy(self) -> np.ndarray:
        if self.value is None:
            raise ValueError("Tensor is empty")
        if type(self.value) != list:
            raise ValueError("Tensor value is not a list")
        tensor = np.array(self.value, dtype=self.dtype)
        return tensor

    def to_list(self) -> list:
        return self.to_numpy().tolist()

    @staticmethod
    def from_numpy(tensor: np.ndarray, **kwargs):
        return Tensor(value=tensor.tolist(), dtype=str(tensor.dtype), **kwargs)

    @staticmethod
    def from_list(tensor: list, **kwargs):
        return Tensor(value=tensor, **kwargs)


def to_numpy(num: float | int | Tensor) -> np.ndarray:
    if type(num) in (float, int, list):
        return np.array(num)
    elif type(num) == Tensor:
        return num.to_numpy()
    else:
        raise ValueError()


class OutputType(BaseModel):
    """
    This is the base class for all strucutred output types when a node
    wants to return more than one output.
    """

    pass


class ChatConversation(OutputType):
    """
    The result of a chat conversation.
    """

    messages: list[str] = Field(
        default_factory=list, description="The messages in the conversation"
    )
    response: str = Field(default="", description="The response from the chat system")


class DataFrame(AssetRef):
    type: Literal["dataframe"] = "dataframe"
    columns: Optional[list[str]] = None
    data: Optional[list[list[Any]]] = None


class TrainTestOutput(OutputType):
    train_X: DataFrame = DataFrame()
    train_y: DataFrame = DataFrame()
    test_X: DataFrame = DataFrame()
    test_y: DataFrame = DataFrame()


class Dataset(OutputType):
    """
    This class represents a dataset, which includes a dataframe of features and a dataframe of targets.
    """

    data: DataFrame = DataFrame()
    target: DataFrame = DataFrame()


def is_output_type(type):
    try:
        return issubclass(type, OutputType)
    except:
        return False


ModelFileEnums = (
    "checkpoint_file",
    "clip_file",
    "clip_vision_file",
    "control_net_file",
    "upscale_model_file",
    "lora_file",
    "ip_adapter_file",
)


class TypeMetadata(BaseModel):
    """
    Metadata for a type.
    """

    type: str
    optional: bool = False
    values: Optional[list[str | int]] = None
    type_args: list["TypeMetadata"] = []

    def __repr__(self):
        return f"TypeMetadata(type={self.type}, optional={self.optional}, values={self.values}, type_args={self.type_args})"

    def is_asset_type(self):
        return self.type in asset_types

    def is_comfy_type(self):
        return self.type.startswith("comfy.")

    def get_python_type(self):
        return NameToType[self.type]

    def get_json_schema(self):
        """
        Returns a JSON schema for the type.
        """
        if self.type == "any":
            return {}
        if self.is_comfy_type():
            return {"type": "object", "properties": {"id": {"type": "string"}}}
        if self.is_asset_type():
            return {"type": "object", "properties": {"url": {"type": "string"}}}
        if self.type == "none":
            return {"type": "null"}
        if self.type == "int":
            return {"type": "integer"}
        if self.type == "float":
            return {"type": "number"}
        if self.type == "bool":
            return {"type": "boolean"}
        if self.type == "str":
            return {"type": "string"}
        if self.type == "text":
            return {"type": "string"}
        if self.type == "tensor":
            return {"type": "array", "items": {"type": "number"}}
        if self.type == "list":
            return {
                "type": "array",
                "items": self.type_args[0].get_json_schema(),
            }
        if self.type == "dict":
            return {
                "type": "object",
                "properties": {
                    f"key_{i}": t.get_json_schema()
                    for i, t in enumerate(self.type_args)
                },
            }
        if self.type == "union":
            return {
                "anyOf": [t.get_json_schema() for t in self.type_args],
            }
        if self.type == "enum":
            return {
                "type": "string",
                "enum": self.values,
            }
        if self.type in ModelFileEnums:
            return {"type": "object", "properties": {"name": {"type": "string"}}}
        raise ValueError(f"Unknown type: {self.type}")


class OutputSlot(BaseModel):
    """
    An output slot is a slot that can be connected to an input slot.
    """

    type: TypeMetadata
    name: str
    stream: bool = False


def asset_to_ref(asset: Asset):
    if asset.content_type.startswith("image"):
        return ImageRef(asset_id=asset.id)
    elif asset.content_type.startswith("audio"):
        return AudioRef(asset_id=asset.id)
    elif asset.content_type.startswith("video"):
        return VideoRef(asset_id=asset.id)
    elif asset.content_type == "text/csv":
        return DataFrame(asset_id=asset.id)
    elif asset.content_type.startswith("text"):
        return TextRef(asset_id=asset.id)
    elif asset.content_type.startswith("application/model"):
        return ModelRef(asset_id=asset.id)
    elif asset.content_type.startswith("folder"):
        return AssetRef(asset_id=asset.id)
    else:
        raise ValueError(f"Unknown asset type: {asset.content_type}")
