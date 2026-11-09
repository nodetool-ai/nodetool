import "./media-native-bootstrap.mjs";
// Machine-dependent runtime/media exports. All files and codecs are authorized by the host.
// Every host operation except hasEncoder, openEncoder, close and abort
// returns a promise: it runs on a native lane, and the operations of one
// reader or encoder run one at a time, in call order.
function host() {
  if (!globalThis.__host?.media)
    throw new Error("Native media host is not installed");
  return globalThis.__host.media;
}
function poll(signal) {
  if (signal?.aborted)
    throw signal.reason ?? new Error("Media operation aborted");
}
export async function hasEncoder(name) {
  return host().hasEncoder(name);
}
export async function probeMedia(path, options = {}) {
  poll(options.signal);
  return host().probe(path);
}
export async function probeDurationSec(path, options = {}) {
  try {
    return (await probeMedia(path, options)).durationSec;
  } catch (error) {
    poll(options.signal);
    return null;
  }
}
export async function probeHasAudio(path, options = {}) {
  try {
    return Boolean((await probeMedia(path, options)).audio);
  } catch (error) {
    poll(options.signal);
    return false;
  }
}
export async function probeVideoStream(path, options = {}) {
  try {
    return (await probeMedia(path, options)).video;
  } catch (error) {
    poll(options.signal);
    return null;
  }
}
export async function packetTimes(path, options = {}) {
  poll(options.signal);
  return host().packetTimes(path, options.maxPackets ?? 1000000);
}
export async function openRgbaFrameReader(options) {
  poll(options.signal);
  const id = await host().openFilter({
    inputs: [
      {
        filePath: options.filePath,
        kind: "video",
        label: "in",
        seekSec: options.seekSec ?? 0
      }
    ],
    graph: `[in]${options.filter}[out]`,
    output: "out",
    outputKind: "video"
  });
  let closed = false;
  return {
    async next() {
      if (closed) return null;
      poll(options.signal);
      return host().next(id);
    },
    async close() {
      if (!closed) host().close(id);
      closed = true;
    }
  };
}
export async function openVideoFrameEncoder(options) {
  poll(options.signal);
  const id = host().openEncoder(options);
  let closed = false;
  function guard() {
    poll(options.signal);
    if (closed) throw new Error("Media encoder closed");
  }
  return {
    async write(bytes) {
      try {
        guard();
        await host().write(id, bytes);
      } catch (error) {
        host().abort(id);
        closed = true;
        throw error;
      }
    },
    async finish() {
      try {
        guard();
        await host().finish(id);
      } finally {
        host().abort(id);
        closed = true;
      }
    },
    async abort() {
      host().abort(id);
      closed = true;
    }
  };
}
const filterSpec = Symbol("native media filter");
export async function openFilterComplex(options) {
  poll(options.signal);
  let id = null;
  let opening = null;
  let closed = false;
  const stream = {
    [filterSpec]: options,
    async *[Symbol.asyncIterator]() {
      if (closed) return;
      try {
        opening ??= host().openFilter(options);
        id = await opening;
        for (;;) {
          poll(options.signal);
          const frame = await host().next(id);
          if (!frame) return;
          yield {
            ...frame,
            toBuffer: () => frame.pcm ?? frame.rgba,
            free() {}
          };
        }
      } finally {
        await close();
      }
    }
  };
  // Closes the reader once its open settled, also when close() comes first.
  async function close() {
    closed = true;
    if (id === null && opening) {
      try {
        id = await opening;
      } catch {
        return;
      }
    }
    if (id !== null) host().close(id);
  }
  return { frames: () => stream, close };
}
export async function openFilterGraph(options) {
  return openFilterComplex({
    inputs: [
      {
        filePath: options.filePath,
        kind: options.kind,
        label: "in",
        seekSec: options.seekSec ?? 0
      }
    ],
    graph: `[in]${options.filter}[out]`,
    output: "out",
    outputKind: options.kind,
    signal: options.signal
  });
}
export async function decodeAudioToPcm(path, options) {
  poll(options.signal);
  const layout = options.channels
    ? `:channel_layouts=${options.channels === 1 ? "mono" : options.channels === 2 ? "stereo" : `${options.channels}c`}`
    : "";
  const filter = [
    options.filter,
    `aresample=${options.sampleRate}`,
    `aformat=sample_fmts=flt${layout}`,
    options.maxSeconds === undefined ? null : `atrim=end=${options.maxSeconds}`
  ]
    .filter(Boolean)
    .join(",");
  const run = await openFilterGraph({
    filePath: path,
    kind: "audio",
    filter,
    signal: options.signal
  });
  const chunks = [];
  let bytes = 0;
  let channels = options.channels ?? 0;
  try {
    for await (const frame of run.frames()) {
      channels = frame.channels;
      bytes += frame.pcm.byteLength;
      if (bytes > 512 * 1024 * 1024)
        throw new Error("Native PCM byte quota exceeded");
      chunks.push(frame.pcm);
    }
  } finally {
    await run.close();
  }
  const samples = new Float32Array(bytes / 4);
  let offset = 0;
  for (const chunk of chunks) {
    new Uint8Array(samples.buffer).set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { samples, channels, sampleRate: options.sampleRate };
}
export async function muxAudioWithVideoCopy(options) {
  poll(options.signal);
  const spec = options.audio?.[filterSpec];
  if (!spec)
    throw new Error("Native audio mux requires a native filter stream");
  await host().muxAudio({ ...options, audio: undefined, filter: spec });
}

// The timeline's explicit rough-cut fallback. Pictures are streamed, not retained as a whole movie.
export async function concatSegments(options) {
  const { unlink } = await import("node:fs/promises");
  const picturePath = `${options.outPath}.native-picture.mp4`;
  const encoder = await openVideoFrameEncoder({
    outPath: picturePath,
    fps: options.fps,
    width: options.width,
    height: options.height,
    input: "rgba",
    spec: options.video,
    signal: options.signal
  });
  const inputs = [];
  const steps = [];
  const labels = [];
  let elapsed = 0;
  try {
    for (const segment of options.segments) {
      poll(options.signal);
      if (!(segment.durationSec > 0 && Number.isFinite(segment.durationSec)))
        throw new Error(
          "Native concat requires finite positive segment duration"
        );
      const count = Math.ceil(segment.durationSec * options.fps - 1e-9);
      let reader = null;
      let last = new Uint8Array(options.width * options.height * 4);
      if (segment.kind !== "blank")
        reader = await openRgbaFrameReader({
          filePath: segment.filePath,
          seekSec: segment.inSec ?? 0,
          filter: [
            options.videoFilter,
            `fps=${options.fps}:round=up`,
            "format=rgba"
          ]
            .filter(Boolean)
            .join(","),
          signal: options.signal
        });
      try {
        for (let i = 0; i < count; i++) {
          const f = reader ? await reader.next() : null;
          if (f) last = f.rgba;
          await encoder.write(last);
        }
      } finally {
        await reader?.close();
      }
      if (
        segment.kind === "video" &&
        segment.withAudio &&
        (await probeHasAudio(segment.filePath))
      ) {
        const index = inputs.length;
        inputs.push({
          filePath: segment.filePath,
          kind: "audio",
          label: `s${index}`
        });
        steps.push(
          `[s${index}]atrim=start=${segment.inSec ?? 0}:end=${Math.min(segment.outSec ?? Infinity, (segment.inSec ?? 0) + segment.durationSec)},asetpts=PTS-STARTPTS,adelay=${Math.round(elapsed * 1000)}|${Math.round(elapsed * 1000)}[a${index}]`
        );
        labels.push(`[a${index}]`);
      }
      elapsed += count / options.fps;
    }
    await encoder.finish();
    const graph = labels.length
      ? [
          ...steps,
          `${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=0,apad[out]`
        ].join(";")
      : "anullsrc=r=48000:cl=stereo[out]";
    const audio = await openFilterComplex({
      inputs,
      graph,
      output: "out",
      outputKind: "audio",
      signal: options.signal
    });
    try {
      await muxAudioWithVideoCopy({
        videoPath: picturePath,
        audio: audio.frames(),
        outPath: options.outPath,
        codec: options.audioCodec,
        signal: options.signal
      });
    } finally {
      await audio.close();
    }
  } catch (error) {
    await encoder.abort();
    throw error;
  } finally {
    try {
      await unlink(picturePath);
    } catch {}
  }
}
