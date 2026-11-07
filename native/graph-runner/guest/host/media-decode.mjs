// Media staging for node code: bytes are written to a temporary directory in
// the granted workspace, then probed and decoded by the native media host.
import { probeMedia, decodeAudioToPcm } from "./media-native.mjs";
import { writeFileSync, readFileSync, statSync } from "./fs.mjs";
export async function staged(inputs, signal, maxBytes, fn) {
  signal?.throwIfAborted();
  const root = globalThis.__host?.files?.cwd?.();
  if (!root)
    throw new Error(
      "Code native media requires an explicitly granted workspace"
    );
  let total = 0;
  for (const bytes of inputs) {
    if (!(bytes instanceof Uint8Array))
      throw new TypeError("Code media requires bytes");
    total += bytes.byteLength;
    if (total > maxBytes)
      throw new Error("Code media inputs exceed the run media limit");
  }
  const media = globalThis.__host?.media;
  if (!media?.tempDir)
    throw new Error("Code media staging capability is not registered");
  const directory = media.tempDir();
  try {
    const files = inputs.map((bytes, index) => {
      const path = `${directory}/input-${index}`;
      writeFileSync(path, bytes);
      return path;
    });
    const read = (path) => {
      if (statSync(path).size > maxBytes)
        throw new Error("Code media output exceeds the run media limit");
      return readFileSync(path);
    };
    return await fn({ files, directory, read });
  } finally {
    media.releaseTempDir(directory);
  }
}
// `targetRate` resamples the decoded audio. It defaults to the file's rate.
export async function nativeAudioData(bytes, signal, maxBytes, targetRate) {
  return staged([bytes], signal, maxBytes, async ({ files }) => {
    const info = await probeMedia(files[0], { signal });
    if (!info.audio) throw new Error("audio.decode: no audio track found");
    const { channels } = info.audio;
    const sampleRate = targetRate ?? info.audio.sampleRate;
    const seconds = maxBytes / (4 * channels * sampleRate);
    if (info.durationSec > seconds)
      throw new Error(
        "audio.decode: decoded audio exceeds the run media limit"
      );
    const data = await decodeAudioToPcm(files[0], {
      signal,
      sampleRate,
      channels,
      maxSeconds: seconds + 1 / sampleRate
    });
    if (data.samples.byteLength > maxBytes)
      throw new Error(
        "audio.decode: decoded audio exceeds the run media limit"
      );
    return data;
  });
}
