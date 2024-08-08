import base64
from enum import Enum
import enum
from pathlib import Path
from types import NoneType
import numpy as np
from pydantic import BaseModel, Field
from typing import Any, Literal, Optional, Type, Union

from nodetool.metadata.type_metadata import TypeMetadata
from nodetool.models.asset import Asset
from nodetool.models.message import Message as MessageModel, MessageContent, ToolCall
from nodetool.models.task import Task as TaskModel


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


class BaseType(BaseModel):
    """
    This is the base class for all Nodetool types.

    It is used to create a mapping of type names to their corresponding classes.
    """

    type: str

    @classmethod
    def __init_subclass__(cls):
        """
        This method is called when a subclass of BaseType is created.
        We remember the mapping of the subclass to its type name,
        so that we can use it later to create instances of the subclass from the type name.
        """
        super().__init_subclass__()
        if hasattr(cls, "type"):
            add_type_name(cls, cls.type)

    @classmethod
    def from_dict(cls, data):
        """
        Create an instance of the class from a dictionary.

        Args:
            data (dict): The dictionary to create the instance from.

        Returns:
            BaseType: The instance of the class.
        """
        type_name = data.get("type")
        if type_name is None:
            raise ValueError("Type name is missing")
        if type_name not in NameToType:
            raise ValueError(f"Unknown type name: {type_name}")
        return NameToType[type_name](**data)


asset_types = set()


class AssetRef(BaseType):
    type: str = "asset"
    uri: str = ""
    asset_id: str | None = None
    data: bytes | None = None

    def to_dict(self):
        res = {
            "uri": self.uri,
        }
        if self.asset_id:
            res["asset_id"] = self.asset_id
        return res

    def is_empty(self):
        return self.uri == "" and self.asset_id is None and self.data is None

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


class ImageRef(AssetRef):
    """A reference to an image asset."""

    type: Literal["image"] = "image"


class WorkflowRef(BaseType):
    type: Literal["workflow"] = "workflow"
    id: str = ""


class NodeRef(BaseType):
    type: Literal["node"] = "node"
    id: str = ""


class Provider(str, enum.Enum):
    OpenAI = "openai"
    Anthropic = "anthropic"
    Replicate = "replicate"
    HuggingFace = "huggingface"
    Ollama = "ollama"
    Comfy = "comfy"
    Local = "local"
    Empty = "empty"


class GPTModel(str, enum.Enum):
    GPT3 = "gpt-3.5-turbo-0125"
    GPT4 = "gpt-4o"


class AnthropicModel(str, enum.Enum):
    claude_3_opus = "claude-3-opus-20240229"
    claude_3_haiku = "claude-3-haiku-20240307"
    claude_3_5_sonnet = "claude-3-5-sonnet-20240620"


class FunctionModel(BaseType):
    type: Literal["function_model"] = "function_model"
    provider: Provider = Provider.Empty
    name: str = ""
    repo_id: str = ""
    filename: str = ""
    local_path: Path | None = None


class LlamaModel(BaseType):
    type: Literal["llama_model"] = "llama_model"
    name: str = ""
    model: str = ""
    modified_at: str = ""
    size: int = 0
    digest: str = ""
    details: dict = Field(default_factory=dict)


model_file_types = set()


class ModelFile(BaseType):
    name: str = ""

    @classmethod
    def __init_subclass__(cls):
        super().__init_subclass__()
        if hasattr(cls, "type"):
            model_file_types.add(cls.type)


class CheckpointFile(ModelFile):
    type: Literal["comfy.checkpoint_file"] = "comfy.checkpoint_file"


class UNetFile(ModelFile):
    type: Literal["comfy.unet_file"] = "comfy.unet_file"


class VAEFile(ModelFile):
    type: Literal["comfy.vae_file"] = "comfy.vae_file"


class CLIPFile(ModelFile):
    type: Literal["comfy.clip_file"] = "comfy.clip_file"


class unCLIPFile(ModelFile):
    type: Literal["comfy.unclip_file"] = "comfy.unclip_file"


class GLIGENFile(ModelFile):
    type: Literal["comfy.gligen_file"] = "comfy.gligen_file"


class CLIPVisionFile(ModelFile):
    type: Literal["comfy.clip_vision_file"] = "comfy.clip_vision_file"


class ControlNetFile(ModelFile):
    type: Literal["comfy.control_net_file"] = "comfy.control_net_file"


class IPAdapterFile(ModelFile):
    type: Literal["comfy.ip_adapter_file"] = "comfy.ip_adapter_file"


class LORAFile(ModelFile):
    type: Literal["comfy.lora_file"] = "comfy.lora_file"


class UpscaleModelFile(ModelFile):
    type: Literal["comfy.upscale_model_file"] = "comfy.upscale_model_file"


comfy_model_types = set()


class ComfyModel(BaseType):
    name: str = ""

    @classmethod
    def __init_subclass__(cls):
        super().__init_subclass__()
        if hasattr(cls, "type"):
            comfy_model_types.add(cls.type)


class CLIP(ComfyModel):
    type: Literal["comfy.clip"] = "comfy.clip"


class CLIPVision(ComfyModel):
    type: Literal["comfy.clip_vision"] = "comfy.clip_vision"


class CLIPVisionOutput(BaseType):
    type: Literal["comfy.clip_vision_output"] = "comfy.clip_vision_output"


class GLIGEN(ComfyModel):
    type: Literal["comfy.gligen"] = "comfy.gligen"


class ControlNet(ComfyModel):
    type: Literal["comfy.control_net"] = "comfy.control_net"


class VAE(ComfyModel):
    type: Literal["comfy.vae"] = "comfy.vae"


class UNet(ComfyModel):
    type: Literal["comfy.unet"] = "comfy.unet"


class UpscaleModel(ComfyModel):
    type: Literal["comfy.upscale_model"] = "comfy.upscale_model"


class LORA(ComfyModel):
    type: Literal["comfy.lora"] = "comfy.lora"


class IPAdapter(ComfyModel):
    type: Literal["comfy.ip_adapter"] = "comfy.ip_adapter"


comfy_data_types = set()


class ComfyData(BaseType):
    data: Any = None

    @classmethod
    def __init_subclass__(cls):
        super().__init_subclass__()
        if hasattr(cls, "type"):
            comfy_data_types.add(cls.type)

    def serialize(self):
        return None


class Conditioning(ComfyData):
    type: Literal["comfy.conditioning"] = "comfy.conditioning"


class Noise(ComfyData):
    type: Literal["comfy.noise"] = "comfy.noise"


class Guider(ComfyData):
    type: Literal["comfy.guider"] = "comfy.guider"


class Latent(ComfyData):
    type: Literal["comfy.latent"] = "comfy.latent"


class ImageTensor(ComfyData):
    type: Literal["comfy.image_tensor"] = "comfy.image_tensor"


class InsightFace(ComfyData):
    type: Literal["comfy.insight_face"] = "comfy.insight_face"


class Mask(ComfyData):
    type: Literal["comfy.mask"] = "comfy.mask"


class Sigmas(ComfyData):
    type: Literal["comfy.sigmas"] = "comfy.sigmas"


class Sampler(ComfyData):
    type: Literal["comfy.sampler"] = "comfy.sampler"


class Embeds(ComfyData):
    type: Literal["comfy.embeds"] = "comfy.embeds"


class Task(BaseType):
    type: Literal["task"] = "task"
    id: str = ""
    task_type: str = ""
    user_id: str = ""
    thread_id: str = ""
    status: str = ""
    name: str = ""
    instructions: str = ""
    dependencies: list[str] = []
    required_capabilities: list[str] = []
    started_at: str = ""
    finished_at: str | None = None
    error: str | None = None
    result: str | None = None
    cost: float | None = None

    @classmethod
    def from_model(cls, task: TaskModel):
        return cls(
            id=task.id,
            user_id=task.user_id,
            task_type=task.task_type,
            thread_id=task.thread_id,
            status=task.status,
            name=task.name,
            instructions=task.instructions,
            dependencies=task.dependencies,
            required_capabilities=task.required_capabilities,
            started_at=task.started_at.isoformat(),
            finished_at=task.finished_at.isoformat() if task.finished_at else None,
            error=task.error,
            result=task.result,
            cost=task.cost,
        )


class FunctionDefinition(BaseModel):
    name: str
    description: str
    parameters: Any


class ChatToolParam(BaseModel):
    type: Literal["function"]
    function: FunctionDefinition


class ChatMessageParam(BaseModel):
    role: str


class ChatSystemMessageParam(ChatMessageParam):
    role: Literal["system"]
    content: str
    name: Optional[str] = None


class ChatUserMessageParam(ChatMessageParam):
    role: Literal["user"]
    content: str | list[MessageContent]
    name: Optional[str] = None


class ChatAssistantMessageParam(ChatMessageParam):
    role: Literal["assistant"]
    content: Optional[str] = None
    name: Optional[str] = None
    tool_calls: Optional[list] = None


class ChatToolMessageParam(ChatMessageParam):
    role: Literal["tool"]
    content: Any
    tool_call_id: str


class Tensor(BaseType):
    type: Literal["tensor"] = "tensor"
    value: list[Any] = []
    dtype: Optional[str] = None

    def is_empty(self):
        return len(self.value) == 0

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


ColumnType = Union[
    Literal["int"],
    Literal["float"],
    Literal["datetime"],
    Literal["string"],
    Literal["object"],
]


class ColumnDef(BaseModel):
    name: str
    data_type: ColumnType
    description: str = ""


def dtype_name(dtype: str):
    if dtype.startswith("int"):
        return "int"
    if dtype.startswith("float"):
        return "float"
    if dtype.startswith("datetime"):
        return "datetime"
    return "object"


class RecordType(BaseType):
    type: Literal["record_type"] = "record_type"
    columns: list[ColumnDef] = []


class DataframeRef(AssetRef):
    type: Literal["dataframe"] = "dataframe"
    columns: list[ColumnDef] | None = None
    data: list[list[Any]] | None = None


class TrainTestOutput(OutputType):
    train_X: DataframeRef = DataframeRef()
    train_y: DataframeRef = DataframeRef()
    test_X: DataframeRef = DataframeRef()
    test_y: DataframeRef = DataframeRef()


class RankingResult(BaseType):
    type: Literal["ranking_result"] = "ranking_result"
    score: float
    text: str


class Dataset(OutputType):
    """
    This class represents a dataset, which includes a dataframe of features and a dataframe of targets.
    """

    data: DataframeRef = DataframeRef()
    target: DataframeRef = DataframeRef()


def is_output_type(type):
    try:
        return issubclass(type, OutputType)
    except:
        return False


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
        return DataframeRef(asset_id=asset.id)
    elif asset.content_type.startswith("text"):
        return TextRef(asset_id=asset.id)
    elif asset.content_type.startswith("application/model"):
        return ModelRef(asset_id=asset.id)
    elif asset.content_type.startswith("folder"):
        return AssetRef(asset_id=asset.id)
    else:
        raise ValueError(f"Unknown asset type: {asset.content_type}")


class Message(BaseType):
    """
    Abstract representation for a chat message.
    Independent of the underlying chat system, such as OpenAI or Anthropic.
    """

    type: str = "message"
    id: str | None = None
    """
    The unique identifier of the message.
    """

    thread_id: str | None = None
    """
    The unique identifier of the thread the message belongs to.
    """

    user_id: str | None = None
    """
    The unique identifier of the user who sent the message.
    """

    tool_call_id: str | None = None
    """
    The unique identifier of the tool call associated with the message.
    """

    role: str = ""
    """
    One of "user", "assistant", "system", or "tool".
    """

    name: str = ""
    """
    The name of the user who sent the message.
    """

    content: str | list[MessageContent] | None = None
    """
    Text content or a list of message content objects, which can be text, images, or other types of content.
    """

    tool_calls: list[ToolCall] | None = None
    """
    The list of tool calls returned by the model.
    """

    created_at: str | None = None
    """
    The timestamp when the message was created.
    It is represented as a string in ISO 8601 format.
    """

    @staticmethod
    def from_model(message: MessageModel):
        """
        Convert a Model object to a Message object.

        Args:
            message (Message): The Message object to convert.

        Returns:
            Message: The abstract Message object.
        """
        return Message(
            id=message.id,
            thread_id=message.thread_id,
            tool_call_id=message.tool_call_id,
            role=message.role,
            name=message.name,
            content=message.content,
            tool_calls=message.tool_calls,
            created_at=message.created_at.isoformat(),
        )
