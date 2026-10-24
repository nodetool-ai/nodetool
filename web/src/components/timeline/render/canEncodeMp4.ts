/**
 * Whether this browser's encoders can write the MP4 export at the timeline's
 * size and the bitrates the renderer asks for: H.264 for the picture and AAC
 * for the sound. A browser without one of them fails the export only after
 * it starts, with the encoder's own configuration string as the message.
 * Chromium builds without proprietary codecs have neither, or only the video
 * one, so the audio check matters too (study 16: "mp4a.40.2 ... is not
 * supported by this browser").
 *
 * An unanswered probe counts as supported, so a probe failure never takes
 * MP4 away from a browser that can write it.
 */
export async function canEncodeMp4(width: number, height: number): Promise<boolean> {
  try {
    const { canEncodeAudio, canEncodeVideo, QUALITY_HIGH, QUALITY_MEDIUM } =
      await import("mediabunny");
    const [video, audio] = await Promise.all([
      canEncodeVideo("avc", { width, height, bitrate: QUALITY_HIGH }),
      canEncodeAudio("aac", {
        numberOfChannels: 2,
        sampleRate: 48000,
        bitrate: QUALITY_MEDIUM
      })
    ]);
    return video && audio;
  } catch {
    return true;
  }
}
