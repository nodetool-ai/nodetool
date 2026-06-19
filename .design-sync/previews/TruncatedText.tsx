import * as React from "react";
import { TruncatedText, FlexColumn, Text } from "nodetool";

export const SingleLine = () => (
  <div style={{ width: 240 }}>
    <TruncatedText showTooltip>
      stable-diffusion-xl-base-1.0-fp16-finetuned-photoreal.safetensors
    </TruncatedText>
  </div>
);

export const MultiLine = () => (
  <div style={{ width: 280 }}>
    <TruncatedText maxLines={2}>
      This workflow ingests a folder of audio files, transcribes each one with
      Whisper, summarizes the transcript, and writes the result back to the
      asset library as a markdown note.
    </TruncatedText>
  </div>
);

export const Comparison = () => (
  <FlexColumn gap={1.5} style={{ width: 260 }}>
    <Text size="small" color="secondary">maxLines=1</Text>
    <TruncatedText maxLines={1}>
      /Users/mg/workspace/nodetool/assets/output/generated-image-final-v3.png
    </TruncatedText>
    <Text size="small" color="secondary">maxLines=3</Text>
    <TruncatedText maxLines={3}>
      /Users/mg/workspace/nodetool/assets/output/generated-image-final-v3.png is
      the most recent render produced by the image upscaler workflow on the GPU
      worker, queued at 14:32 and completed in 8.2 seconds.
    </TruncatedText>
  </FlexColumn>
);
