import {
  encodeWav,
  generateMusic,
  getMusicgen
} from "@nodetool-ai/transformers-js-nodes";
import type {
  EncodedAudioResult,
  TextToMusicParams
} from "@nodetool-ai/runtime";

/**
 * MusicGen on this computer. It makes instrumental music only, so a request
 * with lyrics is refused instead of returning music without the words.
 */
export async function textToMusic(
  params: TextToMusicParams
): Promise<EncodedAudioResult> {
  const prompt = params.prompt.trim();
  if (!prompt) throw new Error("prompt is required");
  if (params.lyrics?.trim()) {
    throw new Error(
      `${params.model.id} makes instrumental music and cannot sing lyrics. ` +
        "Remove the lyrics or pick a model that sings."
    );
  }

  const musicgen = await getMusicgen(params.model.id, undefined, undefined);
  const result = await generateMusic(musicgen, prompt, {
    durationSeconds: params.durationSeconds,
    signal: params.signal
  });
  const wav = encodeWav(result.audio, result.sampling_rate);
  return {
    data: new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength),
    mimeType: "audio/wav"
  };
}
