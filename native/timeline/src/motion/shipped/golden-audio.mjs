import assert from 'node:assert/strict';

export const ORIGINAL_CONTENT_TYPES = 'const CONTENT_TYPES = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".png": "image/png", ".jpg": "image/jpeg" };';
export const AUDIO_CONTENT_TYPES = 'const CONTENT_TYPES = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".png": "image/png", ".jpg": "image/jpeg", ".wav": "audio/wav" };';

export function goldenAudioSource(source) {
  if (source.includes(AUDIO_CONTENT_TYPES)) {
    assert.equal(source.split(AUDIO_CONTENT_TYPES).length, 2, 'audio content-type declaration must occur once');
    return source;
  }
  assert.equal(source.split(ORIGINAL_CONTENT_TYPES).length, 2, 'golden importer content-type declaration changed');
  return source.replace(ORIGINAL_CONTENT_TYPES, AUDIO_CONTENT_TYPES);
}
