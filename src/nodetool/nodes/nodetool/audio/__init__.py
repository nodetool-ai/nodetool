import io
from typing import Literal
from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import FolderRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class SaveAudio(BaseNode):
    """
    Save an audio file to a specified folder.
    """

    value: AudioRef = AudioRef()
    folder: FolderRef = Field(
        FolderRef(), description="The folder to save the audio file to. "
    )
    name: str = Field(default="audio", description="The name of the audio file.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        audio = await context.audio_to_audio_segment(self.value)
        file = io.BytesIO()
        audio.export(file)
        file.seek(0)
        return await context.audio_from_segment(
            audio, self.name, parent_id=self.folder.asset_id
        )
