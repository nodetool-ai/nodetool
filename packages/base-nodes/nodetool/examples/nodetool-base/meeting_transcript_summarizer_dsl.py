"""
Meeting Transcript Summarizer DSL Example

Automatically transcribe a meeting recording and generate concise notes.

Workflow:
1. **Audio Input** - Load meeting recording
2. **Automatic Speech Recognition** - Transcribe audio using Whisper model
3. **Summarizer** - Generate concise summary from the transcript
4. **String Output** - Display the summary
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.constant import Audio
from nodetool.dsl.nodetool.text import AutomaticSpeechRecognition
from nodetool.dsl.nodetool.agents import Summarizer
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import ASRModel, AudioRef, LanguageModel, Provider
from nodetool.workflows.processing_context import AssetOutputMode


"""
Transcribe a meeting recording and summarize it.
"""
# Load meeting audio
audio_input = Audio(
    value=AudioRef(
        uri="https://app.nodetool.ai/examples/remove_silence.mp3",
        type="audio",
    )
)

# Transcribe audio using Whisper
transcription = AutomaticSpeechRecognition(
    audio=audio_input.output,
    model=ASRModel(
        type="asr_model",
        provider=Provider.HuggingFaceFalAI,
        id="openai/whisper-large-v3",
    ),
)

# Summarize the transcript
summary = Summarizer(
    text=transcription.out.text,
    model=LanguageModel(
        type="language_model",
        id="openai/gpt-oss-120b",
        provider=Provider.HuggingFaceCerebras
    ),
)

# Output the summary
output = Output(
    name="summary",
    value=summary.out.text,
)

# Create the graph
graph = create_graph(output)


if __name__ == "__main__":
    result = run_graph(graph, asset_output_mode=AssetOutputMode.WORKSPACE)
    print(f"Meeting summary: {result['summary']}")
