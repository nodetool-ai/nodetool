# nodetool.nodes.huggingface.audio

## AutomaticSpeechRecognition

Automatic Speech Recognition (ASR), also known as Speech to Text (STT), is the task of transcribing a given audio to text. It has many applications, such as voice user interfaces.

**Tags:** asr, speech, audio, huggingface

**Inherits from:** HuggingfaceNode

- **model**: The model ID to use for the speech recognition (`ModelId`)
- **audio**: The input audio to transcribe (`AudioRef`)

## TextToAudio

Generate audio from a text input using a Huggingface model.

**Tags:** audio, text, huggingface

**Inherits from:** HuggingfaceNode

- **model**: The model ID to use for the audio generation (`ModelId`)
- **inputs**: The input text to the model (`str`)

## TextToSpeech

Text-to-Speech (TTS) is the task of generating natural sounding
that generates speech for multiple speakers and multiple languages.

### Use Cases
* Text-to-Speech (TTS) models can be used in any speech-enabled application that requires converting text to speech imitating human voice.
* TTS models are used to create voice assistants on smart devices. These models are a better alternative compared to concatenative methods where the assistant is built by recording sounds and mapping them, since the outputs in TTS models contain elements in natural speech such as emphasis.
* TTS models are widely used in airport and public transportation announcement systems to convert the announcement of a given text into speech.

**Tags:** speech given text input. TTS models can be extended to have a single model

**Inherits from:** HuggingfaceNode

- **model**: The model ID to use for the image generation (`ModelId`)
- **inputs**: The input text to the model (`str`)

