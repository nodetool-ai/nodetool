# whisper.cpp

Local speech recognition providers and streaming transcription for NodeTool.

Install `@fugood/whisper.node@1.1.3` through the desktop Package Manager.
Download GGML ASR models from `ggerganov/whisper.cpp` through Models.
The providers are excluded from the cloud profile.

- `whisper_cpp` runs ASR inside the backend. Model ids are absolute paths from
  discovery. `WHISPER_CPP_MODELS_DIR` adds a directory to the Hugging Face hub
  cache scan. `WHISPER_CPP_GPU_BACKEND` accepts `auto`, `metal`, `cuda`,
  `vulkan`, or `cpu`. Restart after changing the backend because the binding
  caches the first native variant loaded.
- Enable the `whisper-cpp` node pack for `whisper_cpp.LiveTranscription`.
  Supply mono PCM16 audio as base64 chunks. `content_metadata.sample_rate`
  defaults to 16000. A `done: true` chunk ends the stream. Install
  `ggml-org/whisper-vad/ggml-silero-v5.1.2.bin` for speech boundaries, otherwise
  the node uses fixed windows.

The binding returns transcription timestamps in milliseconds and VAD times
in centiseconds. The provider returns ASR timestamps in seconds.

Run tests with `npm run test --workspace=packages/whisper-cpp`.
Set `WHISPER_CPP_TEST_MODEL` to a real model path to enable the native test.
The speech fixture is the public-domain JFK inaugural-address excerpt from
[whisper.cpp samples](https://github.com/ggml-org/whisper.cpp/blob/master/samples/jfk.wav).
