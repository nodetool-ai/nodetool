// Shared Web Audio helpers for streaming PCM16 audio chunks

let sharedAudioContext: AudioContext | null = null;
let sharedNextStartTime = 0;

export function getAudioContext(): AudioContext {
  if (typeof window === "undefined") {throw new Error("No window");}
  const Ctx =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!sharedAudioContext) {
    sharedAudioContext = new Ctx();
    if (!sharedAudioContext) {throw new Error("Failed to create AudioContext");}
  }
  return sharedAudioContext;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = (base64 || "")
    .replace(/^data:[^;]*;base64,/, "")
    .replace(/\s/g, "");
  const binaryString = atob(cleaned);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {bytes[i] = binaryString.charCodeAt(i);}
  return bytes;
}

export function int16ToFloat32(int16Array: Int16Array): Float32Array {
  const float32 = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    const s = int16Array[i];
    float32[i] = s < 0 ? s / 32768 : s / 32767;
  }
  return float32;
}

export function playPcm16Base64(
  base64: string,
  opts?: { sampleRate?: number; channels?: number }
): void {
  const sampleRate = opts?.sampleRate ?? 22000;
  const channels = opts?.channels ?? 1;

  const ctx = getAudioContext();
  ctx.resume().catch(() => {});

  const u8 = base64ToUint8Array(base64);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const frameCount = Math.floor(u8.byteLength / 2 / channels);
  const buffer = ctx.createBuffer(channels, frameCount, sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const channelData = new Int16Array(frameCount);
    let srcIndex = ch * 2;
    for (let i = 0; i < frameCount; i++) {
      const sample = view.getInt16(srcIndex, true);
      channelData[i] = sample;
      srcIndex += channels * 2;
    }
    const floatData = int16ToFloat32(channelData);
    buffer.copyToChannel(floatData, ch);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  const startTime = Math.max(sharedNextStartTime, ctx.currentTime);
  try {
    source.start(startTime);
    sharedNextStartTime = startTime + buffer.duration;
  } catch {
    source.start();
    sharedNextStartTime = ctx.currentTime + buffer.duration;
  }
  source.onended = () => {
    source.disconnect();
  };
}

export function resetAudioScheduler(): void {
  sharedNextStartTime = 0;
}
