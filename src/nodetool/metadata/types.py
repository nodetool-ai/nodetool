from enum import Enum
import enum
from pathlib import Path
from types import NoneType
import numpy as np
from pydantic import BaseModel, Field
from typing import Any, Literal, Optional, Type, Union
from typing import Literal

from nodetool.metadata.type_metadata import TypeMetadata
from nodetool.models.asset import Asset
from nodetool.models.task import Task as TaskModel
from nodetool.types.graph import Graph


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
    data: bytes | list[bytes] | None = None

    def to_dict(self):
        res = {
            "uri": self.uri,
        }
        if self.asset_id:
            res["asset_id"] = self.asset_id
        return res

    def is_empty(self):
        return self.uri == "" and self.asset_id is None and self.data is None

    def is_set(self):
        return not self.is_empty()

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
    GPT4Mini = "gpt-4o-mini"


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
    repo_id: str = ""
    modified_at: str = ""
    size: int = 0
    digest: str = ""
    details: dict = Field(default_factory=dict)

    def is_set(self) -> bool:
        return self.repo_id != ""


class HuggingFaceModel(BaseType):
    type: str = "hf.model"
    repo_id: str = ""
    path: str | None = None
    allow_patterns: list[str] | None = None
    ignore_patterns: list[str] | None = None

    def is_set(self) -> bool:
        return self.repo_id != ""

    def is_empty(self) -> bool:
        return self.repo_id == ""


class HFImageTextToText(HuggingFaceModel):
    type: Literal["hf.image_text_to_text"] = "hf.image_text_to_text"


class HFVisualQuestionAnswering(HuggingFaceModel):
    type: Literal["hf.visual_question_answering"] = "hf.visual_question_answering"


class HFMiniCPM(HuggingFaceModel):
    type: Literal["hf.minicpm"] = "hf.minicpm"


class HFGOTOCR(HuggingFaceModel):
    type: Literal["hf.gotocr"] = "hf.gotocr"


class HFDocumentQuestionAnswering(HuggingFaceModel):
    type: Literal["hf.document_question_answering"] = "hf.document_question_answering"


class HFVideoTextToText(HuggingFaceModel):
    type: Literal["hf.video_text_to_text"] = "hf.video_text_to_text"


class HFComputerVision(HuggingFaceModel):
    type: Literal["hf.computer_vision"] = "hf.computer_vision"


class HFDepthEstimation(HuggingFaceModel):
    type: Literal["hf.depth_estimation"] = "hf.depth_estimation"


class HFImageClassification(HuggingFaceModel):
    type: Literal["hf.image_classification"] = "hf.image_classification"


class HFObjectDetection(HuggingFaceModel):
    type: Literal["hf.object_detection"] = "hf.object_detection"


class HFImageSegmentation(HuggingFaceModel):
    type: Literal["hf.image_segmentation"] = "hf.image_segmentation"


class HFTextToImage(HuggingFaceModel):
    type: Literal["hf.text_to_image"] = "hf.text_to_image"


class HFStableDiffusion(HuggingFaceModel):
    type: Literal["hf.stable_diffusion"] = "hf.stable_diffusion"


class HFStableDiffusionXL(HuggingFaceModel):
    type: Literal["hf.stable_diffusion_xl"] = "hf.stable_diffusion_xl"


class HFControlNet(HuggingFaceModel):
    type: Literal["hf.controlnet"] = "hf.controlnet"


class HFControlNetSDXL(HuggingFaceModel):
    type: Literal["hf.controlnet_sdxl"] = "hf.controlnet_sdxl"


class HFIPAdapter(HuggingFaceModel):
    type: Literal["hf.ip_adapter"] = "hf.ip_adapter"


class HFLoraSD(HuggingFaceModel):
    type: Literal["hf.lora_sd"] = "hf.lora_sd"


class HFLoraSDXL(HuggingFaceModel):
    type: Literal["hf.lora_sdxl"] = "hf.lora_sdxl"


class HFStableDiffusionXLTurbo(HuggingFaceModel):
    type: Literal["hf.stable_diffusion_xl_turbo"] = "hf.stable_diffusion_xl_turbo"


class HFStableDiffusionUpscale(HuggingFaceModel):
    type: Literal["hf.stable_diffusion_upscale"] = "hf.stable_diffusion_upscale"


class HFImageToText(HuggingFaceModel):
    type: Literal["hf.image_to_text"] = "hf.image_to_text"


class HFImageToImage(HuggingFaceModel):
    type: Literal["hf.image_to_image"] = "hf.image_to_image"


class HFImageToVideo(HuggingFaceModel):
    type: Literal["hf.image_to_video"] = "hf.image_to_video"


class HFUnconditionalImageGeneration(HuggingFaceModel):
    type: Literal["hf.unconditional_image_generation"] = (
        "hf.unconditional_image_generation"
    )


class HFCLIPVision(HuggingFaceModel):
    type: Literal["hf.clip_vision"] = "hf.clip_vision"


class HFVideoClassification(HuggingFaceModel):
    type: Literal["hf.video_classification"] = "hf.video_classification"


class HFTextToVideo(HuggingFaceModel):
    type: Literal["hf.text_to_video"] = "hf.text_to_video"


class HFZeroShotImageClassification(HuggingFaceModel):
    type: Literal["hf.zero_shot_image_classification"] = (
        "hf.zero_shot_image_classification"
    )


class HFMaskGeneration(HuggingFaceModel):
    type: Literal["hf.mask_generation"] = "hf.mask_generation"


class HFZeroShotObjectDetection(HuggingFaceModel):
    type: Literal["hf.zero_shot_object_detection"] = "hf.zero_shot_object_detection"


class HFTextTo3D(HuggingFaceModel):
    type: Literal["hf.text_to_3d"] = "hf.text_to_3d"


class HFImageTo3D(HuggingFaceModel):
    type: Literal["hf.image_to_3d"] = "hf.image_to_3d"


class HFImageFeatureExtraction(HuggingFaceModel):
    type: Literal["hf.image_feature_extraction"] = "hf.image_feature_extraction"


class HFNaturalLanguageProcessing(HuggingFaceModel):
    type: Literal["hf.natural_language_processing"] = "hf.natural_language_processing"


class HFTextClassification(HuggingFaceModel):
    type: Literal["hf.text_classification"] = "hf.text_classification"


class HFTokenClassification(HuggingFaceModel):
    type: Literal["hf.token_classification"] = "hf.token_classification"


class HFTableQuestionAnswering(HuggingFaceModel):
    type: Literal["hf.table_question_answering"] = "hf.table_question_answering"


class HFQuestionAnswering(HuggingFaceModel):
    type: Literal["hf.question_answering"] = "hf.question_answering"


class HFZeroShotClassification(HuggingFaceModel):
    type: Literal["hf.zero_shot_classification"] = "hf.zero_shot_classification"


class HFTranslation(HuggingFaceModel):
    type: Literal["hf.translation"] = "hf.translation"


class HFSummarization(HuggingFaceModel):
    type: Literal["hf.summarization"] = "hf.summarization"


class HFFeatureExtraction(HuggingFaceModel):
    type: Literal["hf.feature_extraction"] = "hf.feature_extraction"


class HFTextGeneration(HuggingFaceModel):
    type: Literal["hf.text_generation"] = "hf.text_generation"


class HFText2TextGeneration(HuggingFaceModel):
    type: Literal["hf.text2text_generation"] = "hf.text2text_generation"


class HFFillMask(HuggingFaceModel):
    type: Literal["hf.fill_mask"] = "hf.fill_mask"


class HFSentenceSimilarity(HuggingFaceModel):
    type: Literal["hf.sentence_similarity"] = "hf.sentence_similarity"


class HFTextToSpeech(HuggingFaceModel):
    type: Literal["hf.text_to_speech"] = "hf.text_to_speech"


class HFTextToAudio(HuggingFaceModel):
    type: Literal["hf.text_to_audio"] = "hf.text_to_audio"


class HFAutomaticSpeechRecognition(HuggingFaceModel):
    type: Literal["hf.automatic_speech_recognition"] = "hf.automatic_speech_recognition"


class HFAudioToAudio(HuggingFaceModel):
    type: Literal["hf.audio_to_audio"] = "hf.audio_to_audio"


class HFAudioClassification(HuggingFaceModel):
    type: Literal["hf.audio_classification"] = "hf.audio_classification"


class HFZeroShotAudioClassification(HuggingFaceModel):
    type: Literal["hf.zero_shot_audio_classification"] = (
        "hf.zero_shot_audio_classification"
    )


class HFRealESRGAN(HuggingFaceModel):
    type: Literal["hf.real_esrgan"] = "hf.real_esrgan"


class HFVoiceActivityDetection(HuggingFaceModel):
    type: Literal["hf.voice_activity_detection"] = "hf.voice_activity_detection"


class HFLoraSDConfig(BaseType):
    type: Literal["hf.lora_sd_config"] = "hf.lora_sd_config"
    lora: HFLoraSD = Field(default=HFLoraSD(), description="The LoRA model to use.")
    strength: float = Field(default=0.5, ge=0.0, le=3.0, description="LoRA strength")


class HFLoraSDXLConfig(BaseType):
    type: Literal["hf.lora_sdxl_config"] = "hf.lora_sdxl_config"
    lora: HFLoraSDXL = Field(default=HFLoraSDXL(), description="The LoRA model to use.")
    strength: float = Field(default=0.5, ge=0.0, le=3.0, description="LoRA strength")


CLASSNAME_TO_MODEL_TYPE = {
    "StableDiffusionPipeline": "hf.stable_diffusion",
    "StableDiffusionXLPipeline": "hf.stable_diffusion_xl",
    "StableDiffusionXLControlNetPipeline": "hf.stable_diffusion_xl",
    "StableDiffusionUpscalePipeline": "hf.stable_diffusion_upscale",
    "PixArtAlphaPipeline": "hf.pixart_alpha",
}


PIPELINE_TAGS = {
    "hf.audio_classification": ["audio-classification"],
    "hf.audio_to_audio": ["audio-to-audio"],
    "hf.automatic_speech_recognition": ["automatic-speech-recognition"],
    "hf.computer_vision": ["computer-vision"],
    "hf.depth_estimation": ["depth-estimation"],
    "hf.document_question_answering": ["document-question-answering"],
    "hf.feature_extraction": ["feature-extraction"],
    "hf.fill_mask": ["fill-mask"],
    "hf.image_classification": ["image-classification"],
    "hf.image_feature_extraction": ["image-feature-extraction"],
    "hf.image_segmentation": ["image-segmentation"],
    "hf.image_text_to_text": ["image-text-to-text"],
    "hf.image_to_3d": ["image-to-3d"],
    "hf.image_to_image": ["image-to-image"],
    "hf.image_to_video": ["image-to-video"],
    "hf.mask_generation": ["mask-generation"],
    "hf.natural_language_processing": ["natural-language-processing"],
    "hf.object_detection": ["object-detection"],
    "hf.question_answering": ["question-answering"],
    "hf.sentence_similarity": ["sentence-similarity"],
    "hf.stable_diffusion_xl": ["stable-diffusion-xl"],
    "hf.stable_diffusion": ["stable-diffusion"],
    "hf.summarization": ["summarization"],
    "hf.table_question_answering": ["table-question-answering"],
    "hf.text_classification": ["text-classification"],
    "hf.text_generation": ["text-generation"],
    "hf.text_to_3d": ["text-to-3d"],
    "hf.text_to_audio": ["text-to-audio"],
    "hf.text_to_image": ["text-to-image"],
    "hf.text_to_speech": ["text-to-speech"],
    "hf.text_to_video": ["text-to-video"],
    "hf.text2text_generation": ["text2text-generation"],
    "hf.token_classification": ["token-classification"],
    "hf.translation": ["translation"],
    "hf.unconditional_image_generation": ["unconditional-image-generation"],
    "hf.video_classification": ["video-classification"],
    "hf.video_text_to_text": ["video-text-to-text"],
    "hf.visual_question_answering": ["visual-question-answering"],
    "hf.voice_activity_detection": ["voice-activity-detection"],
    "hf.zero_shot_audio_classification": ["zero-shot-audio-classification"],
    "hf.zero_shot_classification": ["zero-shot-classification"],
    "hf.zero_shot_image_classification": ["zero-shot-image-classification"],
    "hf.zero_shot_object_detection": ["zero-shot-object-detection"],
}


def pipeline_tag_to_model_type(tag: str) -> str | None:
    for model_type, tags in PIPELINE_TAGS.items():
        if tag in tags:
            return model_type
    return None


model_file_types = set()


class ModelFile(BaseType):
    name: str = ""

    def is_set(self) -> bool:
        return self.name != ""

    def is_empty(self) -> bool:
        return self.name == ""

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


class InstantIDFile(ModelFile):
    type: Literal["comfy.instant_id_file"] = "comfy.instant_id_file"


def comfy_model_to_folder(type_name: str) -> str:
    folder_mapping = {
        "comfy.checkpoint_file": "checkpoints",
        "comfy.vae_file": "vae",
        "comfy.clip": "clip",
        "comfy.clip_vision": "clip_vision",
        "comfy.control_net": "controlnet",
        "comfy.ip_adapter": "ipadapter",
        "comfy.gligen": "gligen",
        "comfy.upscale_model": "upscale_models",
        "comfy.lora": "loras",
        "comfy.unet": "unet",
        "comfy.instant_id_file": "instantid",
    }
    return folder_mapping.get(type_name, type_name)


comfy_model_types = set()


class ComfyModel(BaseType):
    name: str = ""
    model: Any = None

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


class InstantID(ComfyModel):
    type: Literal["comfy.instant_id"] = "comfy.instant_id"


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


class LoRAConfig(BaseType):
    type: Literal["comfy.lora_config"] = "comfy.lora_config"
    lora: LORAFile = Field(default=LORAFile(), description="The LoRA model to use.")
    strength: float = Field(default=1.0, ge=0.0, le=2.0, description="LoRA strength")


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


class Mask(ComfyData):
    type: Literal["comfy.mask"] = "comfy.mask"


class Sigmas(ComfyData):
    type: Literal["comfy.sigmas"] = "comfy.sigmas"


class Sampler(ComfyData):
    type: Literal["comfy.sampler"] = "comfy.sampler"


class Embeds(ComfyData):
    type: Literal["comfy.embeds"] = "comfy.embeds"


class FaceAnalysis(ComfyData):
    type: Literal["comfy.face_analysis"] = "comfy.face_analysis"


class FaceEmbeds(ComfyData):
    type: Literal["comfy.face_embeds"] = "comfy.face_embeds"


class REMBGSession(ComfyData):
    type: Literal["comfy.rembg_session"] = "comfy.rembg_session"


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
            started_at=task.started_at.isoformat(),
            finished_at=task.finished_at.isoformat() if task.finished_at else None,
            error=task.error,
            result=task.result,
            cost=task.cost,
        )


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


class RankingResult(BaseType):
    type: Literal["ranking_result"] = "ranking_result"
    score: float
    text: str


class ImageSegmentationResult(BaseType):
    type: Literal["image_segmentation_result"] = "image_segmentation_result"
    label: str
    mask: ImageRef


class BoundingBox(BaseType):
    type: Literal["bounding_box"] = "bounding_box"
    xmin: float
    ymin: float
    xmax: float
    ymax: float


class ObjectDetectionResult(BaseType):
    type: Literal["object_detection_result"] = "object_detection_result"
    label: str
    score: float
    box: BoundingBox


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


class FunctionDefinition(BaseModel):
    name: str
    description: str
    parameters: Any


class ToolCall(BaseModel):
    id: str = ""
    name: str = ""
    args: dict[str, Any] = {}
    result: Any = None


class MessageTextContent(BaseModel):
    type: Literal["text"] = "text"
    text: str = ""


class MessageImageContent(BaseModel):
    type: Literal["image_url"] = "image_url"
    image: ImageRef = ImageRef()


class MessageAudioContent(BaseModel):
    type: Literal["audio"] = "audio"
    audio: AudioRef = AudioRef()


class MessageVideoContent(BaseModel):
    type: Literal["video"] = "video"
    video: VideoRef = VideoRef()


MessageContent = (
    MessageTextContent | MessageImageContent | MessageAudioContent | MessageVideoContent
)


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

    auth_token: str | None = None
    """
    The authentication token for the user.
    """

    workflow_id: str | None = None
    """
    The unique identifier of the workflow the message should be processed within.
    """

    graph: Graph | None = None
    """
    For unsaved workflows, the whole graph needs to be provided.
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
    def from_model(message: Any):
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


class AudioChunk(BaseType):
    type: Literal["audio_chunk"] = "audio_chunk"
    timestamp: tuple[float, float]
    text: str
