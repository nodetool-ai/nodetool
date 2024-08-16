# nodetool.nodes.huggingface.audio

## AudioClassifier

Classifies audio into predefined categories.

Use cases:
- Classify music genres
- Detect speech vs. non-speech audio
- Identify environmental sounds
- Emotion recognition in speech

**Fields:**
model: AudioClassifierModelId
inputs: AudioRef

## AutomaticSpeechRecognition

Transcribes spoken audio to text.

Use cases:
- Transcribe interviews or meetings
- Create subtitles for videos
- Implement voice commands in applications

**Fields:**
model: ASRModelId
inputs: AudioRef

## StableAudioNode

Generates audio using the Stable Audio Pipeline based on a text prompt.

Use cases:
- Creating custom sound effects based on textual descriptions
- Generating background audio for videos or games
- Exploring AI-generated audio for creative projects

**Fields:**
prompt: str
negative_prompt: str
duration: float
num_inference_steps: int
seed: int

## TextToAudio

Generates audio (music or sound effects) from text descriptions.

Use cases:
- Create custom background music for videos or games
- Generate sound effects based on textual descriptions
- Prototype musical ideas quickly

**Fields:**
model: TextToAudioModelId
inputs: str

## TextToSpeech

Generates natural-sounding speech from text input.

Use cases:
- Create voice content for apps and websites
- Develop voice assistants with natural-sounding speech
- Generate automated announcements for public spaces

**Fields:**
model: TTSModelId
inputs: str

## ZeroShotAudioClassifier

Classifies audio into categories without the need for training data.

Use cases:
- Quickly categorize audio without training data
- Identify sounds or music genres without predefined labels
- Automate audio tagging for large datasets

**Fields:**
model: ZeroShotAudioClassifierModelId
inputs: AudioRef
candidate_labels: str

