# nodetool.nodes.replicate.audio.transcribe

## IncrediblyFastWhisper

whisper-large-v3, incredibly fast, powered by Hugging Face Transformers! 🤗

**Fields:**
task: Task
audio: AudioRef
hf_token: str | None
language: Language
timestamp: Timestamp
batch_size: int
diarise_audio: bool

## Whisper

Convert speech in audio to text

**Fields:**
audio: AudioRef
model: str
language: typing.Optional[nodetool.nodes.replicate.audio.transcribe.Whisper.Language]
patience: float | None
translate: bool
temperature: float
transcription: Transcription
initial_prompt: str | None
suppress_tokens: str
logprob_threshold: float
no_speech_threshold: float
condition_on_previous_text: bool
compression_ratio_threshold: float
temperature_increment_on_fallback: float

