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
          const frame = await host().next(id, options.batchSec ?? 0, options.s16 === true);
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
    batchSec: options.batchSec,
    s16: options.s16,
    signal: options.signal
  });
}
async function readAudioChunks(path, options) {
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
    batchSec: 1,
    s16: options.s16 === true,
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
  return { chunks, bytes, channels, sampleRate: options.sampleRate };
}
// Copies the chunks into `target` from `offset`, dropping each as it goes so
// the pieces and the whole are not all alive at the peak.
function joinChunks(chunks, target, offset) {
  for (let i = 0; i < chunks.length; i++) {
    target.set(chunks[i], offset);
    offset += chunks[i].byteLength;
    chunks[i] = null;
  }
}
export async function decodeAudioToPcm(path, options) {
  const { chunks, bytes, channels, sampleRate } = await readAudioChunks(path, options);
  const samples = new Float32Array(bytes / 4);
  joinChunks(chunks, new Uint8Array(samples.buffer), 0);
  return { samples, channels, sampleRate };
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

// `source`'s first audio track as 16-bit PCM WAV at `outPath`, at its own rate
// and channel count unless options say otherwise. Bytes go through a temp file.
export async function convertAudioToWav(source, outPath, options = {}) {
  poll(options.signal);
  const { writeFile, unlink } = await import("node:fs/promises");
  let path = source;
  let temp = null;
  if (typeof source !== "string") {
    temp = `${outPath}.native-source`;
    await writeFile(temp, source);
    path = temp;
  }
  try {
    const info = await probeMedia(path, options);
    if (!info.audio) throw new Error("The media has no audio track");
    const sampleRate = options.sampleRate ?? info.audio.sampleRate;
    // The host makes the 16-bit samples, so no sample passes through here.
    const pcm = await readAudioChunks(path, {
      sampleRate,
      channels: options.channels ?? info.audio.channels,
      s16: true,
      signal: options.signal
    });
    const count = pcm.bytes / 2;
    const wav = new Uint8Array(44 + count * 2);
    const view = new DataView(wav.buffer);
    const text = (at, s) => { for (let i = 0; i < s.length; i++) wav[at + i] = s.charCodeAt(i); };
    text(0, "RIFF"); view.setUint32(4, 36 + count * 2, true); text(8, "WAVE");
    text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, pcm.channels, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * pcm.channels * 2, true);
    view.setUint16(32, pcm.channels * 2, true); view.setUint16(34, 16, true);
    text(36, "data"); view.setUint32(40, count * 2, true);
    joinChunks(pcm.chunks, wav, 44);
    await writeFile(outPath, wav);
  } finally {
    if (temp) { try { await unlink(temp); } catch {} }
  }
}

// As transformMedia in @nodetool-ai/runtime/media/transform.ts, on the host's
// filter, encoder and mux operations. The host has no packet copy except
// muxAudio's video copy, so:
// - a video `copy` of an unseeked input with an audio stream keeps the
//   packets; any other `copy` is decoded and encoded again;
// - an audio `copy` is encoded again with `audioCodec`;
// - the output always has a video stream, and audio ends with the video.
export async function transformMedia(opts) {
  poll(opts.signal);
  const { inputs, signal } = opts;
  if (!opts.video && !opts.audio) throw new Error("The output has no stream");
  if (!opts.video)
    throw new Error(
      "Native transformMedia cannot write an audio-only file: the native media host has no audio file encoder"
    );
  const { unlink } = await import("node:fs/promises");
  const input = (index) => {
    const found = inputs[index];
    if (!found) throw new Error(`There is no input ${index}`);
    return found;
  };
  const audioPlan = await resolvePlan(opts.audio, "audio", inputs, signal);
  let videoPlan = opts.video;
  let picturePath = null;
  let temp = null;
  if ("copy" in videoPlan) {
    const source = input(videoPlan.copy);
    if (!source.seekSec && source.toSec === undefined && audioPlan)
      picturePath = source.filePath;
    else videoPlan = { filter: "null", input: videoPlan.copy };
  }
  try {
    if (!picturePath) {
      picturePath = audioPlan ? (temp = `${opts.outPath}.native-picture.mp4`) : opts.outPath;
      await encodePicture(videoPlan, inputs, picturePath, opts, signal);
    }
    if (!audioPlan) return;
    const audio = await openFilterComplex({ ...planFilter(audioPlan, "audio", inputs, ""), signal });
    try {
      await muxAudioWithVideoCopy({
        videoPath: picturePath,
        audio: audio.frames(),
        outPath: opts.outPath,
        codec: opts.audioCodec ?? "aac",
        signal
      });
    } finally {
      await audio.close();
    }
  } finally {
    if (temp) { try { await unlink(temp); } catch {} }
  }
}

// The plan as filter or graph, or null for a missing optional stream.
async function resolvePlan(plan, kind, inputs, signal) {
  if (!plan) return null;
  if ("graph" in plan) return plan;
  const index = "copy" in plan ? plan.copy : plan.input ?? 0;
  const source = inputs[index];
  if (!source) throw new Error(`There is no input ${index}`);
  const info = await probeMedia(source.filePath, { signal });
  if (!info[kind]) {
    if (plan.optional) return null;
    throw new Error(`${source.filePath} has no ${kind} stream`);
  }
  return "copy" in plan ? { filter: kind === "audio" ? "anull" : "null", input: index } : plan;
}

// openFilterComplex options for a filter or graph plan, with `tail` after it.
function planFilter(plan, kind, inputs, tail) {
  if ("graph" in plan) {
    const found = new Map();
    const graph = plan.graph.replace(/\[(\d+):([va])\]/g, (_, n, k) => {
      const source = inputs[Number(n)];
      if (!source) throw new Error(`The graph reads [${n}:${k}] but there is no input ${n}`);
      const label = `i${n}${k}`;
      if (!found.has(label))
        found.set(label, {
          filePath: source.filePath,
          kind: k === "v" ? "video" : "audio",
          label,
          seekSec: source.seekSec ?? 0
        });
      return `[${label}]`;
    });
    return {
      inputs: [...found.values()],
      graph: tail ? `${graph};[${plan.output}]${tail}[__transform_out]` : graph,
      output: tail ? "__transform_out" : plan.output,
      outputKind: kind
    };
  }
  const source = inputs[plan.input ?? 0];
  const seekSec = source.seekSec > 0 ? source.seekSec : 0;
  const prefix = kind === "audio" ? "a" : "";
  const chain = [
    seekSec > 0 ? `${prefix}trim=start=0` : null,
    source.toSec !== undefined && source.toSec > seekSec ? `${prefix}trim=end=${source.toSec - seekSec}` : null,
    plan.filter,
    tail
  ].filter(Boolean).join(",") || (kind === "audio" ? "anull" : "null");
  return {
    inputs: [{ filePath: source.filePath, kind, label: "in", seekSec }],
    graph: `[in]${chain}[out]`,
    output: "out",
    outputKind: kind
  };
}

// Filtered video frames encoded at the first video input's frame rate.
async function encodePicture(plan, inputs, outPath, opts, signal) {
  const first = "graph" in plan ? inputs[0] : inputs[plan.input ?? 0];
  const info = await probeMedia(first.filePath, { signal });
  if (!info.video && !("graph" in plan)) throw new Error(`${first.filePath} has no video stream`);
  const fps = info.video?.nominalFps || info.video?.averageFps || 30;
  const run = await openFilterComplex({
    ...planFilter(plan, "video", inputs, `fps=${fps},format=rgba`),
    signal
  });
  let encoder = null;
  try {
    for await (const frame of run.frames()) {
      encoder ??= await openVideoFrameEncoder({
        outPath,
        fps,
        width: frame.width,
        height: frame.height,
        input: "rgba",
        spec: opts.videoEncoder ?? { codec: "libx264", pixelFormat: "yuv420p" },
        muxerOptions: opts.muxerOptions,
        signal
      });
      await encoder.write(frame.rgba);
    }
    if (!encoder) throw new Error("No input stream reached the output");
    await encoder.finish();
  } catch (error) {
    await encoder?.abort();
    throw error;
  } finally {
    await run.close();
  }
}

// As concatCopy: the host has no packet copy, so the inputs are decoded and
// encoded again at the first input's size and frame rate.
export async function concatCopy(opts) {
  poll(opts.signal);
  if (opts.inputPaths.length === 0) throw new Error("Nothing to join");
  const infos = [];
  for (const path of opts.inputPaths) infos.push(await probeMedia(path, opts));
  const video = infos[0].video;
  if (!video) throw new Error(`${opts.inputPaths[0]} has no video stream`);
  const width = video.displayWidth + (video.displayWidth % 2);
  const height = video.displayHeight + (video.displayHeight % 2);
  await concatSegments({
    outPath: opts.outPath,
    fps: video.nominalFps || video.averageFps || 30,
    width,
    height,
    video: { codec: "libx264", pixelFormat: "yuv420p" },
    videoFilter: `scale=${width}:${height}`,
    audioCodec: "aac",
    segments: opts.inputPaths.map((filePath, i) => {
      if (!(infos[i].durationSec > 0)) throw new Error(`${filePath} has no known duration`);
      return { kind: "video", filePath, durationSec: infos[i].durationSec, withAudio: true };
    }),
    signal: opts.signal
  });
}

// As pngFrames: frames after `filter`, encoded as PNG by the host image codec.
export async function* pngFrames(opts) {
  const seekSec = opts.seekSec > 0 ? opts.seekSec : 0;
  const run = await openFilterGraph({
    filePath: opts.filePath,
    kind: "video",
    filter: [seekSec > 0 ? "trim=start=0" : null, opts.filter, "format=rgba"].filter(Boolean).join(","),
    seekSec,
    signal: opts.signal
  });
  const image = globalThis.__host?.image;
  if (!image) throw new Error("The native runner has no host image codec capability");
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  let count = 0;
  try {
    for await (const frame of run.frames()) {
      if (count >= limit) break;
      yield await image.encodePngAsync(frame.rgba, frame.width, frame.height);
      count += 1;
    }
  } finally {
    await run.close();
  }
}
