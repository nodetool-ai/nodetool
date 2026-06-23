/**
 * Detect an audio container from its leading magic bytes.
 *
 * Used by providers that return an audio file (mp3/wav/…) without a reliable
 * Content-Type — e.g. FAL/KIE result URLs and ElevenLabs responses. Defaults to
 * `audio/mpeg`, the most common TTS encoding.
 */
export function sniffAudioMime(bytes: Uint8Array): string {
  // RIFF....WAVE
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return "audio/wav";
  }
  // "OggS"
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return "audio/ogg";
  }
  // "fLaC"
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return "audio/flac";
  }
  // ID3-tagged MP3 ("ID3") or a raw MPEG frame sync (0xFFEx).
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  ) {
    return "audio/mpeg";
  }
  return "audio/mpeg";
}
