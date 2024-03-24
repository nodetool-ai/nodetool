from pydantic import Field
from genflow.metadata.types import ImageTensor, Mask, Tensor
from genflow.metadata.types import asset_to_ref
from genflow.models.asset import Asset
from genflow.metadata.types import FolderRef
from genflow.metadata.types import AssetRef
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import AudioRef
from genflow.metadata.types import ImageRef
from genflow.metadata.types import TextRef
from genflow.workflows.genflow_node import InputNode
from genflow.metadata.types import VideoRef


class FloatInputNode(InputNode):
    """
    Input for float values.
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


class BoolInputNode(InputNode):
    """
    Input for boolean values.
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


class IntInputNode(InputNode):
    """
    Input for integer values.
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


class StringInputNode(InputNode):
    """
    Input for string values.
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


class ChatInputNode(InputNode):
    """
    Input for chat messages.
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


class TextInputNode(InputNode):
    """
    Input for text values.
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


class ImageInputNode(InputNode, AssetSchemaMixin):
    """
    Input for image values.
    """

    value: ImageRef = Field(ImageRef(), description="The image to use as input.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        return self.value


class VideoInputNode(InputNode, AssetSchemaMixin):
    """
    Input for video values.
    """

    value: VideoRef = Field(VideoRef(), description="The video to use as input.")

    async def process(self, context: ProcessingContext) -> VideoRef:
        return self.value


class AudioInputNode(InputNode, AssetSchemaMixin):
    """
    Input for audio values.
    """

    value: AudioRef = Field(AudioRef(), description="The audio to use as input.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        return self.value


class FolderNode(InputNode, AssetSchemaMixin):
    """
    Input for folder values.
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


class ImageFolderNode(FolderNode):
    """
    Input for image folder values.
    """

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        assets = await super().process(context)
        images = [asset for asset in assets if isinstance(asset, ImageRef)]
        return images


class AudioFolderNode(FolderNode):
    """
    Input for audio folder values.
    """

    async def process(self, context: ProcessingContext) -> list[AudioRef]:
        assets = await super().process(context)
        audios = [asset for asset in assets if isinstance(asset, AudioRef)]
        return audios


class VideoFolderNode(FolderNode):
    """
    Input for video folder values.
    """

    async def process(self, context: ProcessingContext) -> list[VideoRef]:
        assets = await super().process(context)
        videos = [asset for asset in assets if isinstance(asset, VideoRef)]
        return videos


class TextFolderNode(FolderNode):
    """
    Input for text folder values.
    """

    async def process(self, context: ProcessingContext) -> list[TextRef]:
        assets = await super().process(context)
        texts = [asset for asset in assets if isinstance(asset, TextRef)]
        return texts


class ComfyInputImageNode(InputNode, AssetSchemaMixin):
    """
    Input for comfy image values.
    """

    value: ImageRef = Field(ImageRef(), description="The image to use as input.")

    async def process(self, context: ProcessingContext) -> ImageTensor:
        from PIL import Image, ImageOps, ImageSequence
        import torch
        import numpy as np

        img = await context.to_pil(self.value)

        output_images = []
        output_masks = []
        for i in ImageSequence.Iterator(img):
            i = ImageOps.exif_transpose(i)
            image = i.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            image = torch.from_numpy(image)[None,]
            if "A" in i.getbands():
                mask = np.array(i.getchannel("A")).astype(np.float32) / 255.0
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
