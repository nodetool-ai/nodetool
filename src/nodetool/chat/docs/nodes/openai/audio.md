# nodetool.nodes.openai.audio

## TextToSpeech

Converts text to speech using OpenAI TTS models.

Use cases:
- Generate spoken content for videos or podcasts
- Create voice-overs for presentations
- Assist visually impaired users with text reading
- Produce audio versions of written content

**Fields:**
model: TtsModel
voice: Voice
input: str
speed: float

## Transcribe

Transcribes speech from audio to text.

Use cases:
- Convert recorded meetings or lectures to text
- Generate subtitles for videos
- Create searchable archives of audio content
- Assist hearing-impaired users with audio content

**Fields:**
audio: AudioRef
temperature: float

## Translate

Translates speech in audio to English text.

Use cases:
- Translate foreign language audio content to English
- Create English transcripts of multilingual recordings
- Assist non-English speakers in understanding audio content
- Enable cross-language communication in audio formats

**Fields:**
audio: AudioRef
temperature: float

