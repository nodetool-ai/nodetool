# nodetool.nodes.huggingface.automatic_speech_recognition

## ChunksToSRT

Convert audio chunks to SRT (SubRip Subtitle) format

**Use Cases:**
- Generate subtitles for videos
- Create closed captions from audio transcriptions
- Convert speech-to-text output to a standardized subtitle format

**Features:**
- Converts Whisper audio chunks to SRT format
- Supports customizable time offset
- Generates properly formatted SRT file content

**Tags:** subtitle, srt, whisper, transcription

**Fields:**
- **chunks**: List of audio chunks from Whisper transcription (typing.List[nodetool.metadata.types.AudioChunk])
- **time_offset**: Time offset in seconds to apply to all timestamps (float)

### required_inputs

**Args:**


## Whisper

Convert speech to text

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

**Tags:** asr, automatic-speech-recognition, speech-to-text, translate, transcribe, audio, huggingface

**Fields:**
- **model**: The model ID to use for the speech recognition. (HFAutomaticSpeechRecognition)
- **audio**: The input audio to transcribe. (AudioRef)
- **task**: The task to perform: 'transcribe' for speech-to-text or 'translate' for speech translation. (Task)
- **language**: The language of the input audio. If not specified, the model will attempt to detect it automatically. (WhisperLanguage)
- **timestamps**: The type of timestamps to return for the generated text. (Timestamps)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


