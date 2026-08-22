import type { ModuleConfig } from "../types.js";

export const audioConfig: ModuleConfig = {
  "moduleName": "audio",
  "defaultPollInterval": 4000,
  "defaultMaxAttempts": 120,
  "nodes": [
    {
      "className": "ElevenlabsAudioIsolation",
      "modelId": "elevenlabs/audio-isolation",
      "title": "elevenlabs/audio-isolation",
      "description": "elevenlabs/audio-isolation via Kie.ai.\n\n    kie, audio, ai\n\n    Content generation using elevenlabs/audio-isolation",
      "outputType": "audio",
      "fields": [
        {
          "name": "audio",
          "type": "audio",
          "default": {
            "type": "audio",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Audio",
          "description": "URL of the audio file to isolate voice from (File URL after upload, not file content; Accepted types: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/mp4, audio/ogg; Max size: 10.0MB)",
          "required": true
        }
      ],
      "uploads": [
        {
          "field": "audio",
          "kind": "audio",
          "paramName": "audio_url"
        }
      ]
    }
  ]
};
