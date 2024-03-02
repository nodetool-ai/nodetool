import io
from typing import Literal
from pydantic import Field
from genflow.metadata.types import AudioRef
from genflow.metadata.types import FolderRef
from genflow.workflows.genflow_node import GenflowNode
from genflow.workflows.processing_context import ProcessingContext


class SaveAudioNode(GenflowNode):
    """
    Save an audio file to a specified folder.
    """

    value: AudioRef = AudioRef()
    folder: FolderRef = Field(
        FolderRef(), description="The folder to save the audio file to. "
    )
    name: str = Field(default="audio", description="The name of the audio file.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        audio = await context.to_audio_segment(self.value)
        file = io.BytesIO()
        audio.export(file)
        file.seek(0)
        return await context.audio_from_segment(
            audio, self.name, parent_id=self.folder.asset_id
        )
