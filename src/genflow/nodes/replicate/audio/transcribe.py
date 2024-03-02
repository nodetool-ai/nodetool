from genflow.metadata.types import AudioRef
from genflow.workflows.processing_context import ProcessingContext
from genflow.nodes.replicate import ReplicateNode


from pydantic import Field


from enum import Enum
from typing import Any, Type


class IncrediblyFastWhisperNode(ReplicateNode):
    """
    The Incredibly Fast Whisper Node provides real-time speech transcription capabilities. It employs OpenAI's Whisper model to transcribe spoken language into text accurately. This node is capable of handling various languages, accents, and can perform well even in noisy environments.

    #### Applications
    - Transcription of podcasts, interviews, and meetings.
    - Real-time subtitling or captioning videos or live streams.
    - Voice command processing and transcription in multilingual applications.

    #### Example
    For example, to transcribe a podcast episode, simply provide the audio file to the
    Incredibly Fast Whisper Node. It will process the audio and return the transcribed text,
    which can be used for subtitles, content analysis, or accessibility features.
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
