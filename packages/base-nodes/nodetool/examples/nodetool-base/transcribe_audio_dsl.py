"""
Transcribe Audio DSL Example

Convert speech to text using Whisper model with word-level timestamps.

Workflow:
1. **Audio Input** - Record your voice or upload an audio file
2. **Automatic Speech Recognition** - Processes the audio through Whisper model
3. **String Output** - Displays the transcribed text
"""

import os
from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.input import AudioInput
from nodetool.dsl.nodetool.text import AutomaticSpeechRecognition
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import ASRModel, AudioRef, Provider

sample_audio_file = os.path.join(os.path.dirname(__file__), "harvard.mp3")

audio_input = AudioInput(
    name="audio",
    value=AudioRef(
        uri=f"file://{sample_audio_file}",
        type="audio",
    ),
)

transcription = AutomaticSpeechRecognition(
    audio=audio_input.output,
    model=ASRModel(
        id="gpt-4o-mini-transcribe",
        provider=Provider.OpenAI,
        type="asr_model",
    ),
)

output = Output(
    name="transcription",
    value=transcription.out.text,
)

# Create the graph
graph = create_graph(output)


if __name__ == "__main__":
    result = run_graph(graph)
    print(f"Transcription: {result['transcription']}")
