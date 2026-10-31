import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// Existing contracts: native/game/src/audio/Audio.cpp and
// native/game/src/assets/PreparedAssets.h,
// and packages/game-renderer/src/native-cpp/audio.ts. No engine limit changes.
export const BLACKSITE_AUDIO_LIMITS = Object.freeze({ fileBytes: 64 * 1024 * 1024, decodedSamples: 64_000_000, durationSeconds: 600 });
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function run(tool, arguments_, options = {}) {
  const result = spawnSync(tool, arguments_, { timeout: 30_000, maxBuffer: BLACKSITE_AUDIO_LIMITS.fileBytes, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`BLACKSITE audio ${tool} failed: ${result.error?.message ?? result.stderr?.toString("utf8").slice(-4096)}`);
  }
  return result.stdout;
}

export function float32Wave(pcm, channels, sampleRate) {
  if (!Number.isInteger(channels) || channels < 1 || channels > 2 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new Error("BLACKSITE audio channel/rate admission failed");
  }
  const blockAlign = channels * 4;
  if (!pcm.length || pcm.length % blockAlign || pcm.length + 44 > BLACKSITE_AUDIO_LIMITS.fileBytes) {
    throw new Error("BLACKSITE float32 audio file/block budget exceeded");
  }
  const frames = pcm.length / blockAlign;
  const samples = frames * channels;
  if (frames / sampleRate > BLACKSITE_AUDIO_LIMITS.durationSeconds || samples > BLACKSITE_AUDIO_LIMITS.decodedSamples || frames * 2 > 32 * 1024 * 1024) {
    throw new Error("BLACKSITE decoded audio budget exceeded");
  }
  let minimum = Infinity, maximum = -Infinity;
  for (let offset = 0; offset < pcm.length; offset += 4) {
    const value = pcm.readFloatLE(offset);
    if (!Number.isFinite(value)) { throw new Error("BLACKSITE decoded audio contains a nonfinite sample"); }
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  // A canonical RIFF tag-3 header avoids ffmpeg's WAVE_EXTENSIBLE tag. The
  // payload is copied byte for byte, without gain, resampling or quantization.
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(pcm.length + 36, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(3, 20);
  header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28); header.writeUInt16LE(blockAlign, 32); header.writeUInt16LE(32, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return { bytes: Buffer.concat([header, pcm]), metadata: { formatTag: 3, bitsPerSample: 32, channels, sampleRate, frames, samples, durationSeconds: frames / sampleRate, minimumSample: minimum, maximumSample: maximum, decodedPcmDigest: sha256(pcm) } };
}

export function decodeBlacksiteScore(sourceBytes, sourcePath) {
  const probe = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type,codec_name,sample_rate,channels,duration", "-of", "json", sourcePath], { maxBuffer: 65536 }).toString("utf8"));
  if (probe.streams?.length !== 1 || probe.streams[0].codec_type !== "audio" || probe.streams[0].codec_name !== "vorbis") {
    throw new Error("BLACKSITE score must contain one original Vorbis audio stream");
  }
  const stream = probe.streams[0];
  const duration = Number(stream.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > BLACKSITE_AUDIO_LIMITS.durationSeconds) {
    throw new Error("BLACKSITE original audio duration is outside native admission");
  }
  // Decode the verified bytes, not a second read of the source path. Neither
  // -ar nor -ac is supplied, so the authored rate and channels are preserved.
  const arguments_ = ["-v", "error", "-nostdin", "-i", "pipe:0", "-map", "0:a:0", "-vn", "-sn", "-dn", "-c:a", "pcm_f32le", "-f", "f32le", "pipe:1"];
  const pcm = run("ffmpeg", arguments_, { input: sourceBytes });
  const result = float32Wave(pcm, Number(stream.channels), Number(stream.sample_rate));
  return { ...result, metadata: { ...result.metadata, sourceCodec: stream.codec_name, sourceDurationSeconds: duration, sourceDigest: sha256(sourceBytes), decoder: run("ffmpeg", ["-version"], { maxBuffer: 65536 }).toString("utf8").split("\n")[0], decoderArguments: arguments_, limits: BLACKSITE_AUDIO_LIMITS } };
}
