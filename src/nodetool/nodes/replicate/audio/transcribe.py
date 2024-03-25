from nodetool.metadata.types import AudioRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.replicate import ReplicateNode


from pydantic import Field


from enum import Enum
from typing import Any, Type


class IncrediblyFastWhisperNode(ReplicateNode):
    """
    Transcribes spoken language into text, fast.
    speech, s2t, speech-to-text, transcribe, transcription, real-time, multilingual, language
    Outputs text containing the transcription from the provided audio. Handles different languages, accents and background noises.
    """


class Task(str, Enum):
    TRANSCRIBE = "transcribe"
    TRANSLATE = "translate"


audio: AudioRef = Field(
    default=AudioRef(), description="The audio file to be transcribed."
)
task: Task = Field(
    default=Task.TRANSCRIBE, description="The type of transcription task."
)
language: str = Field(
    default="english", description="The language of the audio content if known."
)


def replicate_model_id(self) -> str:
    return "vaibhavs10/incredibly-fast-whisper:37dfc0d6a7eb43ff84e230f74a24dab84e6bb7756c9b457dbdcceca3de7a4a04"


@classmethod
def return_type(cls):
    return str


def convert_output_value(self, context: ProcessingContext, value: Any, t: Type[Any]):
    if value is None:
        return None
    result = dict(value)
    return result.get("text", "")
