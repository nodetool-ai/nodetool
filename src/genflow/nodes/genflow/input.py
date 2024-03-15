from pydantic import Field
from genflow.metadata.types import Tensor
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


class BoolInputNode(InputNode):
    """
    Input for boolean values.
    """

    value: bool = False

    async def process(self, context: ProcessingContext) -> bool:
        return self.value


class IntInputNode(InputNode):
    """
    Input for integer values.
    """

    value: int = 0
    min: int = 0
    max: int = 100

    async def process(self, context: ProcessingContext) -> int:
        return min(max(self.value, self.min), self.max)


class StringInputNode(InputNode):
    """
    Input for string values.
    """

    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value


class TextInputNode(InputNode):
    """
    Input for text values.
    """

    value: TextRef = Field(TextRef(), description="The text to use as input.")

    async def process(self, context: ProcessingContext) -> TextRef:
        return self.value


class ImageInputNode(InputNode):
    """
    Input for image values.
    """

    value: ImageRef = Field(ImageRef(), description="The image to use as input.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        return self.value


class VideoInputNode(InputNode):
    """
    Input for video values.
    """

    value: VideoRef = Field(VideoRef(), description="The video to use as input.")

    async def process(self, context: ProcessingContext) -> VideoRef:
        return self.value


class TensorInputNode(InputNode):
    """
    Input for tensor values.
    """

    value: Tensor = Tensor()


class AudioInputNode(InputNode):
    """
    Input for audio values.
    """

    value: AudioRef = Field(AudioRef(), description="The audio to use as input.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        return self.value


class FolderNode(InputNode):
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
