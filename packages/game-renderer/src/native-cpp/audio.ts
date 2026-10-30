import type { NativeFrame, NativePresentationEvent } from "@nodetool-ai/protocol/native-game";
import type { NativeAssetBroker } from "./contracts.js";

type Play = Extract<NativePresentationEvent, { kind: "play" }>;
function checkWav(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let channels = 0;
  let rate = 0;
  let block = 0;
  let data = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (size > bytes.length - offset - 8) { throw new Error("Truncated native WAV"); }
    if (kind === "fmt ") {
      if (size < 16 || ![1, 3].includes(view.getUint16(offset + 8, true))) { throw new Error("Unsupported native WAV format"); }
      channels = view.getUint16(offset + 10, true); rate = view.getUint32(offset + 12, true); block = view.getUint16(offset + 20, true);
    }
    if (kind === "data") { data += size; }
    offset += 8 + size + (size % 2);
  }
  if (channels < 1 || channels > 2 || rate < 8000 || rate > 192000 || block < channels || !data || data / block / rate > 600 || data / block * channels > 64_000_000) {
    throw new Error("Native WAV decode budget exceeded");
  }
}
export interface NativeAudio {
  unlock(): Promise<void>;
  consume(frame: NativeFrame): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  dispose(): Promise<void>;
}

/** Decode admitted WAV bytes before ticking. Committed output is consumed once. */
export async function createNativeAudio(options: {
  readonly assets: NativeAssetBroker;
  readonly ticksPerSecond: number;
  readonly context?: AudioContext;
  readonly onError?: (error: Error) => void;
}): Promise<NativeAudio> {
  const context = options.context ?? new AudioContext();
  const buffers = new Map<string, AudioBuffer>();
  const voices = new Map<string, AudioBufferSourceNode>();
  const buses = new Map<string, GainNode>();
  let decodedSamples = 0;
  let generation = -1;
  let tick = -1;
  let unlocked = false;
  let disposed = false;
  let latest: NativeFrame | undefined;
  try {
    for (const entry of options.assets.entries) {
      if (entry.kind !== "audio") { continue; }
      const bytes = await options.assets.get(entry.id);
      if (bytes.length < 12 || new TextDecoder().decode(bytes.subarray(0, 4)) !== "RIFF" || new TextDecoder().decode(bytes.subarray(8, 12)) !== "WAVE") {
        throw new Error(`Native audio requires admitted WAV: ${entry.id}`);
      }
      checkWav(bytes);
      const buffer = await context.decodeAudioData(Uint8Array.from(bytes).buffer);
      decodedSamples += buffer.length * buffer.numberOfChannels;
      if (buffer.numberOfChannels > 2 || buffer.duration > 600 || decodedSamples > 64_000_000) { throw new Error("Native decoded audio budget exceeded"); }
      buffers.set(entry.id, buffer);
    }
  } catch (error) { await context.close(); throw error; }
  const stopAll = (): void => {
    for (const source of voices.values()) { source.stop(); source.disconnect(); }
    voices.clear();
  };
  const play = (event: Play, currentTick: number): void => {
    const buffer = buffers.get(event.assetId);
    if (!buffer) { options.onError?.(new Error(`Missing native audio ${event.assetId}`)); return; }
    voices.get(event.id)?.stop();
    const source = context.createBufferSource(); source.buffer = buffer; source.loop = event.loop;
    let bus = buses.get(event.bus);
    if (!bus) { bus = context.createGain(); bus.connect(context.destination); buses.set(event.bus, bus); }
    const gain = context.createGain(); gain.gain.value = event.volume; gain.connect(bus);
    let panner: PannerNode | undefined;
    if (event.position) {
      panner = context.createPanner();
      const position = event.position;
      const xyz = Array.isArray(position) ? position : [position.x, position.y, 0];
      panner.positionX.value = xyz[0] ?? 0; panner.positionY.value = xyz[1] ?? 0; panner.positionZ.value = xyz[2] ?? 0;
      source.connect(panner); panner.connect(gain);
    } else { source.connect(gain); }
    voices.set(event.id, source);
    source.onended = (): void => {
      if (voices.get(event.id) === source) { voices.delete(event.id); }
      source.disconnect(); gain.disconnect(); panner?.disconnect();
    };
    const elapsed = event.music ? Math.max(0, currentTick - (event.startTick ?? event.tick)) / options.ticksPerSecond : 0;
    if (!event.loop && elapsed >= buffer.duration) { voices.delete(event.id); gain.disconnect(); panner?.disconnect(); return; }
    source.start(0, buffer.duration > 0 ? elapsed % buffer.duration : 0);
  };
  const rebuildMusic = (frame: NativeFrame): void => {
    for (const event of frame.music) { if (event.presentationType === "audio" && event.kind === "play") { play(event, frame.tick); } }
  };
  return {
    async unlock() {
      if (disposed) { throw new Error("Native audio is disposed"); }
      await context.resume();
      if (!unlocked) { unlocked = true; if (latest) { rebuildMusic(latest); } }
    },
    consume(frame) {
      if (disposed) { return; }
      const camera = frame.camera;
      if (frame.dimension === "2d") {
        context.listener.positionX.value = frame.camera.x;
        context.listener.positionY.value = frame.camera.y;
        context.listener.positionZ.value = 0;
      } else if ("position" in camera) {
        context.listener.positionX.value = camera.position[0];
        context.listener.positionY.value = camera.position[1];
        context.listener.positionZ.value = camera.position[2];
      }
      latest = frame;
      if (frame.generation === generation && frame.tick <= tick) { return; }
      const restored = generation >= 0 && generation !== frame.generation;
      const changed = generation !== frame.generation;
      generation = frame.generation; tick = frame.tick;
      if (changed) { stopAll(); if (unlocked) { rebuildMusic(frame); } }
      if (!unlocked || restored) { return; }
      for (const event of frame.presentationEvents) {
        if (event.presentationType !== "audio" || event.generation !== generation) { continue; }
        if (event.kind === "stop") { voices.get(event.voiceId)?.stop(); voices.delete(event.voiceId); }
        else if (!changed || !event.music) { play(event, frame.tick); }
      }
    },
    async suspend() { if (!disposed) { await context.suspend(); } },
    async resume() { if (!disposed && unlocked) { await context.resume(); } },
    async dispose() {
      if (disposed) { return; }
      disposed = true; stopAll(); buffers.clear();
      for (const bus of buses.values()) { bus.disconnect(); } buses.clear(); await context.close();
    }
  };
}
