from typing import Any
from pydantic import Field
from nodetool.metadata.types import DataframeRef, ImageTensor
from nodetool.metadata.types import asset_to_ref
from nodetool.models.asset import Asset
from nodetool.metadata.types import FolderRef
from nodetool.metadata.types import AssetRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import ImageRef
from nodetool.metadata.types import TextRef
from nodetool.workflows.base_node import BaseNode, InputNode
from nodetool.metadata.types import VideoRef


class FloatInput(InputNode):
    """
    Float parameter input for workflows.
    input, parameter, float, number

    Use cases:
    - Specify a numeric value within a defined range
    - Set thresholds or scaling factors
    - Configure continuous parameters like opacity or volume
    """

    value: float = 0.0
    min: float = 0
    max: float = 100

    async def process(self, context: ProcessingContext) -> float:
        return min(max(self.value, self.min), self.max)

    def get_json_schema(self):
        return {
            "type": "number",
            "description": self.description,
            "default": self.value,
            "minimum": self.min,
            "maximum": self.max,
        }


class BooleanInput(InputNode):
    """
    Boolean parameter input for workflows.
    input, parameter, boolean, bool

    Use cases:
    - Toggle features on/off
    - Set binary flags
    - Control conditional logic
    """

    value: bool = False

    async def process(self, context: ProcessingContext) -> bool:
        return self.value

    def get_json_schema(self):
        return {
            "type": "boolean",
            "description": self.description,
            "default": self.value,
        }


class IntegerInput(InputNode):
    """
    Integer parameter input for workflows.
    input, parameter, integer, number

    Use cases:
    - Specify counts or quantities
    - Set index values
    - Configure discrete numeric parameters
    """

    value: int = 0
    min: int = 0
    max: int = 100

    async def process(self, context: ProcessingContext) -> int:
        return min(max(self.value, self.min), self.max)

    def get_json_schema(self):
        return {
            "type": "integer",
            "description": self.description,
            "default": self.value,
            "minimum": self.min,
            "maximum": self.max,
        }


class StringInput(InputNode):
    """
    String parameter input for workflows.
    input, parameter, string, text

    Use cases:
    - Provide text labels or names
    - Enter search queries
    - Specify file paths or URLs
    """

    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value

    def get_json_schema(self):
        return {
            "type": "string",
            "description": self.description,
            "default": self.value,
        }


class ChatInput(InputNode):
    """
    Chat message input for workflows.
    input, parameter, chat, message

    Use cases:
    - Accept user prompts or queries
    - Capture conversational input
    - Provide instructions to language models
    """

    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value

    def get_json_schema(self):
        return {
            "type": "string",
            "description": self.description,
            "default": self.value,
        }


class TextInput(InputNode):
    """
    Text content input for workflows.
    input, parameter, text

    Use cases:
    - Load text documents or articles
    - Process multi-line text content
    - Analyze large text bodies
    """

    value: TextRef = Field(TextRef(), description="The text to use as input.")

    async def process(self, context: ProcessingContext) -> TextRef:
        return self.value

    def get_json_schema(self):
        return {
            "type": "string",
            "description": self.description,
            "default": self.value,
        }


class AssetSchemaMixin:
    def get_json_schema(self):
        return {
            "type": "object",
            "properties": {
                "uri": {
                    "type": "string",
                    "description": "The URI of the image.",
                    "format": "uri",
                },
                "asset_id": {
                    "type": "string",
                    "description": "The Asset ID of the image.",
                },
            },
        }


class ImageInput(AssetSchemaMixin, InputNode):
    """
    Image asset input for workflows.
    input, parameter, image

    Use cases:
    - Load images for processing or analysis
    - Provide visual input to models
    - Select images for manipulation
    """

    value: ImageRef = Field(ImageRef(), description="The image to use as input.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        return self.value


class VideoInput(AssetSchemaMixin, InputNode):
    """
    Video asset input for workflows.
    input, parameter, video

    Use cases:
    - Load video files for processing
    - Analyze video content
    - Extract frames or audio from videos
    """

    value: VideoRef = Field(VideoRef(), description="The video to use as input.")

    async def process(self, context: ProcessingContext) -> VideoRef:
        return self.value


class AudioInput(AssetSchemaMixin, InputNode):
    """
    Audio asset input for workflows.
    input, parameter, audio

    Use cases:
    - Load audio files for processing
    - Analyze sound or speech content
    - Provide audio input to models
    """

    value: AudioRef = Field(AudioRef(), description="The audio to use as input.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        return self.value


class Folder(AssetSchemaMixin, InputNode):
    """
    Folder of assets input for workflows.
    input, parameter, folder

    Use cases:
    - Batch process multiple assets
    - Select a collection of related files
    - Iterate over a set of inputs
    """

    folder: FolderRef = Field(FolderRef(), description="The folder to use as input.")
    limit: int = 1000

    async def process(self, context: ProcessingContext) -> list[AssetRef]:
        if self.folder.is_empty():
            return []

        assets, cursor = Asset.paginate(
            user_id=context.user_id,
            parent_id=self.folder.asset_id,
            limit=self.limit,
        )

        return [asset_to_ref(asset) for asset in assets]


class ImageFolder(Folder):
    """
    Folder of image assets input for workflows.
    input, parameter, folder, image

    Use cases:
    - Batch process multiple images
    - Train models on image datasets
    - Create image galleries or collections
    """

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        assets = await super().process(context)
        images = [asset for asset in assets if isinstance(asset, ImageRef)]
        return images


class AudioFolder(Folder):
    """
    Folder of audio assets input for workflows.
    input, parameter, folder, audio

    Use cases:
    - Batch process multiple audio files
    - Analyze audio datasets
    - Create playlists or audio collections
    """

    async def process(self, context: ProcessingContext) -> list[AudioRef]:
        assets = await super().process(context)
        audios = [asset for asset in assets if isinstance(asset, AudioRef)]
        return audios


class VideoFolder(Folder):
    """
    Folder of video assets input for workflows.
    input, parameter, folder, video

    Use cases:
    - Batch process multiple video files
    - Analyze video datasets
    - Create video playlists or collections
    """

    async def process(self, context: ProcessingContext) -> list[VideoRef]:
        assets = await super().process(context)
        videos = [asset for asset in assets if isinstance(asset, VideoRef)]
        return videos


class TextFolder(Folder):
    """
    Folder of text assets input for workflows.
    input, parameter, folder, text

    Use cases:
    - Batch process multiple text documents
    - Analyze text corpora
    - Create document collections
    """

    async def process(self, context: ProcessingContext) -> list[TextRef]:
        assets = await super().process(context)
        texts = [asset for asset in assets if isinstance(asset, TextRef)]
        return texts


class ComfyImageInput(AssetSchemaMixin, InputNode):
    """
    Image input optimized for Comfy workflows.
    input, parameter, image

    Use cases:
    - Load and preprocess images for Comfy models
    - Handle multi-frame images and alpha channels
    - Convert images to tensor format for ML tasks
    """

    value: ImageRef = Field(ImageRef(), description="The image to use as input.")

    async def process(self, context: ProcessingContext) -> ImageTensor:
        from PIL import Image, ImageOps, ImageSequence
        import torch
        import numpy as np

        img = await context.image_to_pil(self.value)

        output_images = []
        output_masks = []
        for i in ImageSequence.Iterator(img):
            i = ImageOps.exif_transpose(i)
            image = i.convert("RGB")  # type: ignore
            image = np.array(image).astype(np.float32) / 255.0
            image = torch.from_numpy(image)[None,]
            if "A" in i.getbands():  # type: ignore
                mask = np.array(i.getchannel("A")).astype(np.float32) / 255.0  # type: ignore
                mask = 1.0 - torch.from_numpy(mask)
            else:
                mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
            output_images.append(image)
            output_masks.append(mask.unsqueeze(0))

        if len(output_images) > 1:
            output_image = torch.cat(output_images, dim=0)
            output_mask = torch.cat(output_masks, dim=0)
        else:
            output_image = output_images[0]
            output_mask = output_masks[0]

        return output_image  # type: ignore


class GroupInput(BaseNode):
    """
    Generic group input for loops.
    input, group, collection, loop

    Use cases:
    - provides input for a loop
    - iterates over a group of items
    """

    _value: Any = None

    async def process(self, context: Any) -> Any:
        return self._value
