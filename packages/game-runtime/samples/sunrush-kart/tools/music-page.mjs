import { renderTimelineAudio } from "../../../../../web/src/components/timeline/render/renderAudio.ts";
import { encodeWav, arrayBufferToBase64 } from "../../../../../web/src/components/audio_editor/audioSample.ts";

window.renderScore = async (sequence, durationSeconds) => {
  const buffer = await renderTimelineAudio({
    ...sequence,
    sampleRate: 48000,
    signal: AbortSignal.timeout(120000),
    resolveUrl: async id => { throw new Error(`The score requires an unexpected asset: ${id}`); }
  });
  if (!buffer) {
    throw new Error("The soundtrack rendered no audio");
  }
  const loopFrames = Math.round(durationSeconds * buffer.sampleRate);
  const start = loopFrames;
  const spliceFrames = Math.round(0.005 * buffer.sampleRate);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => {
    const rendered = buffer.getChannelData(channel);
    const loop = rendered.slice(start, start + loopFrames);
    // Join the end to the samples immediately preceding this exact start.
    // The raised-cosine splice preserves the tails without a fade to silence.
    for (let frame = 0; frame < spliceFrames; frame++) {
      const wet = (1 - Math.cos(Math.PI * frame / (spliceFrames - 1))) / 2;
      const end = loopFrames - spliceFrames + frame;
      loop[end] = loop[end] * (1 - wet) + rendered[start - spliceFrames + frame] * wet;
    }
    return loop;
  });
  let peak = 0;
  for (const channel of channels) {
    for (const sample of channel) {
      if (!Number.isFinite(sample)) {
        throw new Error("The soundtrack contains a non-finite sample");
      }
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  if (peak < 0.001 || peak >= 1) {
    throw new Error(`The soundtrack is silent or clips (peak ${peak})`);
  }
  return arrayBufferToBase64(encodeWav({ sampleRate: buffer.sampleRate, channels }));
};
