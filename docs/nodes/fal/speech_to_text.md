# nodetool.nodes.fal.speech_to_text

## ChunkLevelEnum

An enumeration.

## LanguageEnum

An enumeration.

## TaskEnum

An enumeration.

## Whisper

Whisper is a model for speech transcription and translation that can transcribe audio in multiple languages and optionally translate to English.

Use cases:
- Transcribe spoken content to text
- Translate speech to English
- Generate subtitles and captions
- Create text records of audio content
- Analyze multilingual audio content

**Tags:** speech, audio, transcription, translation, transcribe, translate, multilingual, speech-to-text, audio-to-text

**Fields:**
- **audio**: The audio file to transcribe (AudioRef)
- **task**: Task to perform on the audio file (TaskEnum)
- **language**: Language of the audio file. If not set, will be auto-detected (LanguageEnum)
- **diarize**: Whether to perform speaker diarization (bool)
- **chunk_level**: Level of detail for timestamp chunks (ChunkLevelEnum)
- **num_speakers**: Number of speakers in the audio. If not set, will be auto-detected (int)
- **batch_size**: Batch size for processing (int)
- **prompt**: Optional prompt to guide the transcription (str)


