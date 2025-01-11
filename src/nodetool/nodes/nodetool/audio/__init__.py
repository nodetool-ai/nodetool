from datetime import datetime
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
    audio, folder, name

    Use cases:
    - Save generated audio files with timestamps
    - Organize outputs into specific folders
    - Create backups of generated audio
    """

    audio: AudioRef = AudioRef()
    folder: FolderRef = Field(
        FolderRef(), description="The folder to save the audio file to. "
    )
    name: str = Field(
        default="%Y-%m-%d-%H-%M-%S.opus",
        description="""
        The name of the audio file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
        """,
    )

    def required_inputs(self):
        return ["audio"]

    async def process(self, context: ProcessingContext) -> AudioRef:
        audio = await context.audio_to_audio_segment(self.audio)
        file = io.BytesIO()
        audio.export(file)
        file.seek(0)
        parent_id = self.folder.asset_id if self.folder.is_set() else None
        name = datetime.now().strftime(self.name)
        return await context.audio_from_segment(audio, name, parent_id=parent_id)
