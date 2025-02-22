from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ChunksToSRT(GraphNode):
    """
    Convert audio chunks to SRT (SubRip Subtitle) format
    subtitle, srt, whisper, transcription

    **Use Cases:**
    - Generate subtitles for videos
    - Create closed captions from audio transcriptions
    - Convert speech-to-text output to a standardized subtitle format

    **Features:**
    - Converts Whisper audio chunks to SRT format
    - Supports customizable time offset
    - Generates properly formatted SRT file content
    """

    chunks: List | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of audio chunks from Whisper transcription')
    time_offset: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Time offset in seconds to apply to all timestamps')

    @classmethod
    def get_node_type(cls): return "huggingface.automatic_speech_recognition.ChunksToSRT"


import nodetool.nodes.huggingface.automatic_speech_recognition
import nodetool.nodes.huggingface.automatic_speech_recognition
import nodetool.nodes.huggingface.automatic_speech_recognition

class Whisper(GraphNode):
    """
    Convert speech to text
    asr, automatic-speech-recognition, speech-to-text, translate, transcribe, audio, huggingface

    **Use Cases:**
    - Voice input for a chatbot
    - Transcribe or translate audio files
    - Create subtitles for videos

    **Features:**
    - Multilingual speech recognition
    - Speech translation
    - Language identification

    **Note**
    - Language selection is sorted by word error rate in the FLEURS benchmark
    - There are many variants of Whisper that are optimized for different use cases.

    **Links:**
    - https://github.com/openai/whisper
    - https://platform.openai.com/docs/guides/speech-to-text/supported-languages
    """

    Task: typing.ClassVar[type] = nodetool.nodes.huggingface.automatic_speech_recognition.Whisper.Task
    WhisperLanguage: typing.ClassVar[type] = nodetool.nodes.huggingface.automatic_speech_recognition.Whisper.WhisperLanguage
    Timestamps: typing.ClassVar[type] = nodetool.nodes.huggingface.automatic_speech_recognition.Whisper.Timestamps
    model: HFAutomaticSpeechRecognition | GraphNode | tuple[GraphNode, str] = Field(default=HFAutomaticSpeechRecognition(type='hf.automatic_speech_recognition', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for the speech recognition.')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The input audio to transcribe.')
    task: nodetool.nodes.huggingface.automatic_speech_recognition.Whisper.Task = Field(default=Task.TRANSCRIBE, description="The task to perform: 'transcribe' for speech-to-text or 'translate' for speech translation.")
    language: nodetool.nodes.huggingface.automatic_speech_recognition.Whisper.WhisperLanguage = Field(default=WhisperLanguage.NONE, description='The language of the input audio. If not specified, the model will attempt to detect it automatically.')
    timestamps: nodetool.nodes.huggingface.automatic_speech_recognition.Whisper.Timestamps = Field(default=Timestamps.NONE, description='The type of timestamps to return for the generated text.')

    @classmethod
    def get_node_type(cls): return "huggingface.automatic_speech_recognition.Whisper"


