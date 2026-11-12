#!/usr/bin/env node
// MM0 backend spike (native/timeline/docs/MUSIC-MODE.md, MM0 exit items 1 to 6):
// sends the requests the music mode design depends on to a running
// acestep.cpp `ace-server` and prints a results table.
//
// Start the server first, with both DiTs and a batch limit of at least 2:
//   ace-server --models <dir> --port 8085 --max-batch 2
// Then:
//   node native/timeline/scripts/acestep-spike.mjs --url http://127.0.0.1:8085 --pid <ace-server pid>
//
// Exit item 7 (does `--models` accept a Hugging Face snapshot directory) needs
// no request: point `--models` at a snapshot directory and check GET /props
// lists the files. This script prints /props so that check is one glance.
//
// The wire shapes mirror tools/ace-server.cpp and docs/ARCHITECTURE.md of
// acestep.cpp at the commit pinned in packages/config/src/acestep-runtime.ts
// (07abf07). Line numbers below refer to that commit.
//
//   POST /lm      JSON AceRequest or array     -> {"id":"N"}   (handle_lm, ace-server.cpp:624)
//   POST /synth   JSON, or multipart/form-data -> {"id":"N"}   (handle_synth, :913)
//                 multipart parts: `request` (JSON), `audio` (source file) (:931-:975)
//   GET  /job?id=N                    -> {"status":"running|done|failed|cancelled"} (:1808, :375)
//   GET  /job?id=N&result=1           -> /lm: JSON array of AceRequest (filled with audio_codes)
//                                        /synth: multipart/mixed, boundary "ace-batch-boundary",
//                                        one audio part then one `latent` part per track (:269-:328)
//   GET  /props                       -> models, adapters, cli.max_batch (:1521)
//   Model names are exact GGUF file names including ".gguf" (resolve_name :532,
//   registry_find src/model-registry.h:51). ARCHITECTURE.md prose says "without the suffix",
//   the code does not strip it.
//   output_format "wav32" skips peak normalisation (:872), which exit item 4 needs.
//   lm_batch_size is clamped to --max-batch (:659-:670). synth_batch_size is clamped to 9 (:758).
//
// Options:
//   --url URL           ace-server base URL (default http://127.0.0.1:8085)
//   --pid N             ace-server process id, for the peak memory column (ps rss, macOS and Linux)
//   --turbo NAME        turbo DiT file name   (default acestep-v15-turbo-Q8_0.gguf)
//   --base NAME         base DiT file name    (default acestep-v15-base-Q8_0.gguf)
//   --lm NAME           language model file   (default acestep-5Hz-lm-4B-Q8_0.gguf)
//   --tempo-runs N      outputs per tempo for exit item 3 (default 10)
//   --only LIST         comma list of steps: runtime, swap, tempo, signature, level, lego, batch
//   --out DIR           keep every output WAV here (default: not kept)
//   --dry-run           print the planned requests and exit, sending nothing
//   --self-test         run the analysis code on synthetic audio and exit
//   --help
//
// Exit 0 when every requested step ran. A step that fails prints its error in the table and the
// exit status is 1.

import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const STEPS = ["runtime", "swap", "tempo", "signature", "level", "lego", "batch"];
const SAMPLE_RATE = 48000;
const SOURCE_SECONDS = 16;
const REPAINT_START = 6;
const REPAINT_END = 10;
const CAPTION = "warm lo-fi hip hop beat with soft keys, instrumental";
const LYRICS = "[Instrumental]";

// ---------------------------------------------------------------------------
// Request builders. Each returns the JSON the endpoint takes.
// ---------------------------------------------------------------------------

/** The AceRequest of a text2music job. With bpm, duration and instrumental set the LM skips its metadata pass. */
export function text2musicRequest(options) {
  return {
    caption: options.caption ?? CAPTION,
    lyrics: LYRICS,
    bpm: options.bpm ?? 100,
    duration: options.duration ?? SOURCE_SECONDS,
    keyscale: options.keyscale ?? "C major",
    timesignature: options.timesignature ?? "4",
    vocal_language: "unknown",
    seed: options.seed ?? 1,
    lm_batch_size: options.lmBatchSize ?? 1,
    synth_batch_size: options.synthBatchSize ?? 1,
    task_type: "text2music",
    output_format: options.outputFormat ?? "wav16",
    synth_model: options.synthModel,
    lm_model: options.lmModel
  };
}

/** Repaint a region of the source audio. Repaint skips the LM, so it goes to /synth only. */
export function repaintRequest(options) {
  return {
    caption: options.caption ?? CAPTION,
    lyrics: LYRICS,
    bpm: options.bpm ?? 100,
    keyscale: "C major",
    timesignature: "4",
    seed: options.seed ?? 2,
    task_type: "repaint",
    repainting_start: REPAINT_START,
    repainting_end: REPAINT_END,
    output_format: "wav32",
    synth_model: options.synthModel
  };
}

/** Lego needs the base DiT and a track name. It uses the LM, so /lm runs first (MF13). */
export function legoRequest(options) {
  return {
    caption: options.caption ?? "tight drum kit, steady groove",
    lyrics: LYRICS,
    bpm: options.bpm ?? 100,
    keyscale: "C major",
    timesignature: "4",
    duration: SOURCE_SECONDS,
    seed: options.seed ?? 3,
    task_type: "lego",
    track: options.track ?? "drums",
    output_format: "wav32",
    synth_model: options.synthModel,
    lm_model: options.lmModel
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AceServerClient {
  constructor(baseUrl, log = () => {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.log = log;
  }

  async json(path, init) {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${init?.method ?? "GET"} ${path} -> HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text);
  }

  async props() {
    return this.json("/props");
  }

  /** POST /lm. Returns the filled requests (an array). */
  async lm(requests) {
    const { id } = await this.json("/lm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests)
    });
    await this.wait(id);
    const response = await fetch(`${this.baseUrl}/job?id=${id}&result=1`);
    if (!response.ok) throw new Error(`LM result of job ${id}: HTTP ${response.status}`);
    return JSON.parse(await response.text());
  }

  /** POST /synth, as JSON or as multipart with a source file. Returns the audio parts as Buffers. */
  async synth(requests, sourceWav) {
    let init;
    if (sourceWav) {
      const form = new FormData();
      form.set("request", JSON.stringify(requests));
      form.set("audio", new Blob([sourceWav], { type: "audio/wav" }), "source.wav");
      init = { method: "POST", body: form };
    } else {
      init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requests) };
    }
    const { id } = await this.json("/synth", init);
    await this.wait(id);
    const response = await fetch(`${this.baseUrl}/job?id=${id}&result=1`);
    if (!response.ok) throw new Error(`Synth result of job ${id}: HTTP ${response.status}`);
    return parseMultipartMixed(Buffer.from(await response.arrayBuffer())).filter((part) => part.type.startsWith("audio/"));
  }

  async wait(id, timeoutMs = 30 * 60 * 1000) {
    const started = Date.now();
    for (;;) {
      const { status } = await this.json(`/job?id=${id}`);
      if (status === "done") return;
      if (status === "failed" || status === "cancelled") throw new Error(`Job ${id} ${status}`);
      if (Date.now() - started > timeoutMs) throw new Error(`Job ${id} did not finish in ${timeoutMs / 60000} minutes`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Split a multipart/mixed body with the fixed boundary `ace-batch-boundary` (ace-server.cpp:274). */
export function parseMultipartMixed(body, boundary = "ace-batch-boundary") {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let position = body.indexOf(delimiter);
  while (position >= 0) {
    const after = position + delimiter.length;
    if (body.subarray(after, after + 2).toString() === "--") break;
    const headerEnd = body.indexOf("\r\n\r\n", after);
    if (headerEnd < 0) break;
    const headers = body.subarray(after, headerEnd).toString("latin1");
    const next = body.indexOf(delimiter, headerEnd + 4);
    if (next < 0) break;
    // The body ends with CRLF before the next delimiter.
    const data = body.subarray(headerEnd + 4, next - 2);
    const type = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim() ?? "";
    parts.push({ type, headers, data });
    position = next;
  }
  return parts;
}

/** Decode a RIFF WAV (PCM 16, 24, 32 or float 32) to mono Float32 plus the interleaved channels. */
export function decodeWav(buffer) {
  if (buffer.toString("latin1", 0, 4) !== "RIFF" || buffer.toString("latin1", 8, 12) !== "WAVE") {
    throw new Error("Not a WAV file");
  }
  let format = null;
  let data = null;
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const id = buffer.toString("latin1", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        tag: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        rate: buffer.readUInt32LE(body + 4),
        bits: buffer.readUInt16LE(body + 14)
      };
    } else if (id === "data") {
      data = buffer.subarray(body, Math.min(buffer.length, body + size));
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!format || !data) throw new Error("WAV has no fmt or data chunk");
  const bytes = format.bits / 8;
  const frames = Math.floor(data.length / (bytes * format.channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < format.channels; c++) {
      const at = (i * format.channels + c) * bytes;
      let value;
      if (format.tag === 3 && format.bits === 32) value = data.readFloatLE(at);
      else if (format.bits === 16) value = data.readInt16LE(at) / 32768;
      else if (format.bits === 24) value = data.readIntLE(at, 3) / 8388608;
      else if (format.bits === 32) value = data.readInt32LE(at) / 2147483648;
      else throw new Error(`Unsupported WAV format ${format.tag}/${format.bits}`);
      sum += value;
    }
    mono[i] = sum / format.channels;
  }
  return { rate: format.rate, channels: format.channels, samples: mono };
}

/** Encode mono Float32 samples as a 32-bit float WAV, for uploading a source. */
export function encodeWavFloat(samples, rate = SAMPLE_RATE) {
  const header = Buffer.alloc(44);
  const dataBytes = samples.length * 4;
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVEfmt ", 8, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(dataBytes, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, dataBytes)]);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

/** Onset strength: positive spectral flux of the log magnitude, one value per hop. */
export function onsetEnvelope(samples, rate) {
  const frame = 2048;
  const hop = 512;
  const window = new Float32Array(frame).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame));
  const bins = frame / 2;
  let previous = new Float32Array(bins);
  const envelope = [];
  for (let start = 0; start + frame <= samples.length; start += hop) {
    const re = new Float64Array(frame);
    const im = new Float64Array(frame);
    for (let i = 0; i < frame; i++) re[i] = samples[start + i] * window[i];
    fft(re, im);
    const magnitude = new Float32Array(bins);
    let flux = 0;
    for (let k = 1; k < bins; k++) {
      magnitude[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      flux += Math.max(0, magnitude[k] - previous[k]);
    }
    previous = magnitude;
    envelope.push(flux);
  }
  return { envelope: Float32Array.from(envelope), framesPerSecond: rate / hop };
}

/**
 * The tempo in BPM from the autocorrelation of the onset envelope, in 60 to 200 BPM, with a prior around 120.
 * Returns the strongest lag and the autocorrelation strength relative to lag zero.
 */
export function estimateTempo(samples, rate) {
  const { envelope, framesPerSecond } = onsetEnvelope(samples, rate);
  const mean = envelope.reduce((a, b) => a + b, 0) / envelope.length;
  const centred = envelope.map((v) => v - mean);
  const zero = centred.reduce((a, v) => a + v * v, 0) || 1;
  let best = { bpm: 0, strength: -Infinity };
  const minLag = Math.floor((framesPerSecond * 60) / 200);
  const maxLag = Math.ceil((framesPerSecond * 60) / 60);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < centred.length; i++) sum += centred[i] * centred[i + lag];
    // Normalise by overlap so long lags are not penalised.
    // A log-Gaussian prior around 120 BPM (one octave wide) picks between a tempo and its multiples.
    const bpm = (framesPerSecond * 60) / lag;
    const prior = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    const strength = (sum / zero / (1 - lag / centred.length)) * prior;
    if (strength > best.strength) best = { bpm: (framesPerSecond * 60) / lag, strength };
  }
  return best;
}

/** The ratio nearest 1 after folding by a factor of 2: a tracker may report half or double time. */
export function octaveFolded(estimate, requested) {
  let best = estimate;
  for (const factor of [0.5, 2]) {
    const candidate = estimate * factor;
    if (Math.abs(candidate - requested) < Math.abs(best - requested)) best = candidate;
  }
  return best;
}

function rms(samples, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

/** dB difference output minus source over the audio outside [startSec, endSec), plus the RMS of each. */
export function levelDifferenceOutside(source, output, rate, startSec, endSec) {
  const length = Math.min(source.length, output.length);
  const a = Math.floor(startSec * rate);
  const b = Math.min(length, Math.floor(endSec * rate));
  const outsideRms = (samples) => {
    const before = rms(samples, 0, a);
    const after = rms(samples, b, length);
    return Math.sqrt((before * before * a + after * after * (length - b)) / Math.max(1, a + length - b));
  };
  const sourceRms = outsideRms(source);
  const outputRms = outsideRms(output);
  return { db: 20 * Math.log10((outputRms || 1e-12) / (sourceRms || 1e-12)), sourceRms, outputRms };
}

/** Pearson correlation of two sample arrays over their common length. */
export function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return ab / Math.sqrt((aa * bb) || 1);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function rssMegabytes(pid) {
  if (!pid) return null;
  try {
    const kilobytes = Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim());
    return Number.isFinite(kilobytes) ? Math.round(kilobytes / 1024) : null;
  } catch {
    return null;
  }
}

/** Run `work` and sample the server's resident memory every 500 ms, so the peak is not missed. */
async function timed(pid, work) {
  let peak = rssMegabytes(pid) ?? 0;
  const timer = pid ? setInterval(() => { peak = Math.max(peak, rssMegabytes(pid) ?? 0); }, 500) : null;
  const started = performance.now();
  try {
    const value = await work();
    return { value, seconds: (performance.now() - started) / 1000, peakMb: pid ? peak : null };
  } finally {
    if (timer) clearInterval(timer);
  }
}

function fmt(seconds) {
  return `${seconds.toFixed(1)} s`;
}

function keep(options, name, buffer) {
  if (!options.out) return;
  mkdirSync(options.out, { recursive: true });
  writeFileSync(join(options.out, name), buffer);
}

/** The synth step for text2music: /lm then /synth with the filled requests. */
async function generateText2Music(client, request) {
  const filled = await client.lm(Array.isArray(request) ? request : [request]);
  return client.synth(filled);
}

async function runSteps(client, options, rows) {
  const want = (name) => options.only.includes(name);
  const turbo = options.turbo;
  const base = options.base;
  const lm = options.lm;
  let sourceWav = null;

  // Exit items 1 and 2: run times, peak memory, swap time.
  if (want("runtime") || want("swap") || want("level") || want("lego")) {
    const text = await timed(options.pid, () =>
      generateText2Music(client, text2musicRequest({
        lmBatchSize: 2, synthModel: turbo, lmModel: lm, outputFormat: "wav32"
      }))
    );
    sourceWav = text.value[0].data;
    keep(options, "text2music-0.wav", sourceWav);
    if (text.value[1]) keep(options, "text2music-1.wav", text.value[1].data);
    rows.push(["1", "text2music 16 s, 2 candidates, turbo (/lm + /synth)", fmt(text.seconds), `${text.value.length} candidates, peak ${text.peakMb ?? "n/a"} MB`]);
  }
  if (want("runtime")) {
    const repaint = await timed(options.pid, () =>
      client.synth([repaintRequest({ synthModel: turbo })], sourceWav)
    );
    keep(options, "repaint.wav", repaint.value[0].data);
    rows.push(["1", `repaint ${REPAINT_END - REPAINT_START} s in a ${SOURCE_SECONDS} s source, turbo (/synth)`, fmt(repaint.seconds), `peak ${repaint.peakMb ?? "n/a"} MB`]);
  }

  // Exit item 4 reuses a wav32 repaint of the source.
  if (want("level")) {
    const repaint = await client.synth([repaintRequest({ synthModel: turbo })], sourceWav);
    const source = decodeWav(sourceWav);
    const output = decodeWav(repaint[0].data);
    const level = levelDifferenceOutside(source.samples, output.samples, source.rate, REPAINT_START, REPAINT_END);
    rows.push(["4", "wav32 repaint level vs source outside the region", `${level.db.toFixed(2)} dB`, `source rms ${level.sourceRms.toFixed(4)}, output rms ${level.outputRms.toFixed(4)}`]);
  }

  // Exit items 1, 2 and 5: lego on the base DiT, the swap time, the correlation with the source.
  if (want("lego") || want("swap")) {
    const first = await timed(options.pid, () =>
      generateLego(client, options, sourceWav, 3)
    );
    const second = await timed(options.pid, () =>
      generateLego(client, options, sourceWav, 4)
    );
    keep(options, "lego.wav", first.value[0].data);
    if (want("lego")) {
      const source = decodeWav(sourceWav);
      const lego = decodeWav(first.value[0].data);
      const r = correlation(source.samples, lego.samples);
      rows.push(["1", `lego ${SOURCE_SECONDS} s on base (/lm + /synth), warm`, fmt(second.seconds), `peak ${second.peakMb ?? "n/a"} MB`]);
      rows.push(["5", "lego output vs source, Pearson r", r.toFixed(3), r > 0.5 ? "high: the output may contain the mix" : "low: looks like a stem, listen to confirm"]);
    }
    if (want("swap")) {
      rows.push(["2", "turbo to base swap (first lego minus warm lego)", fmt(Math.max(0, first.seconds - second.seconds)), `first ${fmt(first.seconds)}, warm ${fmt(second.seconds)}`]);
    }
  }

  // Exit item 3: tempo adherence.
  if (want("tempo")) {
    for (const bpm of [90, 120, 150]) {
      const errors = [];
      const estimates = [];
      for (let i = 0; i < options.tempoRuns; i++) {
        const out = await generateText2Music(client, text2musicRequest({ bpm, seed: 100 + i, synthModel: turbo, lmModel: lm }));
        keep(options, `tempo-${bpm}-${i}.wav`, out[0].data);
        const wav = decodeWav(out[0].data);
        const estimate = estimateTempo(wav.samples, wav.rate).bpm;
        estimates.push(estimate);
        errors.push(Math.abs(octaveFolded(estimate, bpm) - bpm) / bpm);
      }
      const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
      const worst = Math.max(...errors);
      rows.push(["3", `tempo ${bpm} BPM over ${options.tempoRuns} outputs`, `mean error ${(mean * 100).toFixed(1)} %`, `worst ${(worst * 100).toFixed(1)} %, raw estimates ${estimates.map((e) => e.toFixed(0)).join(" ")}`]);
    }
  }

  // Exit item 3, second half: the note value the model counts in signature 6.
  if (want("signature")) {
    const out = await generateText2Music(client, text2musicRequest({ bpm: 120, timesignature: "6", seed: 7, synthModel: turbo, lmModel: lm }));
    keep(options, "signature-6.wav", out[0].data);
    const wav = decodeWav(out[0].data);
    const pulse = estimateTempo(wav.samples, wav.rate).bpm;
    const ratio = pulse / 120;
    const note = Math.abs(ratio - 1) < 0.15 ? "the pulse matches bpm: bpm counts the pulse the tracker hears (the dotted beat if it is a compound feel)"
      : Math.abs(ratio - 2) < 0.3 || Math.abs(ratio - 3) < 0.45 ? "the strongest pulse is faster than bpm: bpm counts a longer note than the pulse (likely the dotted quarter or the bar half)"
        : "no clear relation, listen to the output";
    rows.push(["3", "signature 6 at 120 BPM, strongest pulse", `${pulse.toFixed(0)} BPM (x${ratio.toFixed(2)})`, note]);
  }

  // Exit item 6: lm_batch_size against synth_batch_size.
  if (want("batch")) {
    const byLm = await timed(options.pid, () =>
      generateText2Music(client, text2musicRequest({ lmBatchSize: 2, synthBatchSize: 1, seed: 11, synthModel: turbo, lmModel: lm }))
    );
    const bySynth = await timed(options.pid, () =>
      generateText2Music(client, text2musicRequest({ lmBatchSize: 1, synthBatchSize: 2, seed: 11, synthModel: turbo, lmModel: lm }))
    );
    keep(options, "batch-lm-0.wav", byLm.value[0].data);
    keep(options, "batch-lm-1.wav", byLm.value[1].data);
    keep(options, "batch-synth-0.wav", bySynth.value[0].data);
    keep(options, "batch-synth-1.wav", bySynth.value[1].data);
    const spread = (parts) => {
      const [a, b] = parts.map((p) => decodeWav(p.data).samples);
      return 1 - Math.abs(correlation(a, b));
    };
    rows.push(["6", "lm_batch_size 2: candidates, differ by (1 - |r|)", `${byLm.value.length} outputs, ${fmt(byLm.seconds)}`, `difference ${spread(byLm.value).toFixed(3)}`]);
    rows.push(["6", "synth_batch_size 2: candidates, differ by (1 - |r|)", `${bySynth.value.length} outputs, ${fmt(bySynth.seconds)}`, `difference ${spread(bySynth.value).toFixed(3)} (listen: same song or two songs?)`]);
  }
}

/** Lego: /lm first (MF13), then /synth with the source audio uploaded beside the filled request. */
async function generateLego(client, options, sourceWav, seed) {
  const filled = await client.lm([legoRequest({ synthModel: options.base, lmModel: options.lm, seed })]);
  return client.synth(filled, sourceWav);
}

// ---------------------------------------------------------------------------
// Plan, self test, main
// ---------------------------------------------------------------------------

function plan(options) {
  const lines = [];
  const add = (item, endpoint, body, note) => lines.push({ item, endpoint, body, note });
  const t = { synthModel: options.turbo, lmModel: options.lm };
  add("1,2", "POST /lm then POST /synth", text2musicRequest({ ...t, lmBatchSize: 2, outputFormat: "wav32" }), "text2music 16 s, two candidates (lm_batch_size 2 needs --max-batch 2), turbo. This output is the source for the next steps.");
  add("1", "POST /synth multipart: request + audio=source.wav", repaintRequest({ synthModel: options.turbo }), `repaint ${REPAINT_START} to ${REPAINT_END} s of the 16 s source, turbo, wav32`);
  add("4", "POST /synth multipart: request + audio=source.wav", repaintRequest({ synthModel: options.turbo }), "the same wav32 repaint: RMS difference of the audio outside the region");
  add("1,2,5", "POST /lm then POST /synth multipart: request + audio=source.wav", legoRequest({ synthModel: options.base, lmModel: options.lm }), "lego on the base DiT, twice: the first run includes the turbo to base swap, the second is warm. Correlates the output with the source");
  for (const bpm of [90, 120, 150]) {
    add("3", "POST /lm then POST /synth", text2musicRequest({ ...t, bpm, seed: 100 }), `tempo ${bpm} BPM, ${options.tempoRuns} outputs with seeds 100 to ${99 + options.tempoRuns}; beat tracker on each`);
  }
  add("3", "POST /lm then POST /synth", text2musicRequest({ ...t, bpm: 120, timesignature: "6", seed: 7 }), "signature 6 at 120 BPM: strongest pulse against 120");
  add("6", "POST /lm then POST /synth", text2musicRequest({ ...t, lmBatchSize: 2, seed: 11 }), "two candidates through lm_batch_size");
  add("6", "POST /lm then POST /synth", text2musicRequest({ ...t, synthBatchSize: 2, seed: 11 }), "two candidates through synth_batch_size");
  return lines;
}

function selfTest() {
  const rate = 24000;
  const failures = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
    if (!ok) failures.push(name);
  };
  for (const bpm of [90, 120, 150]) {
    const samples = new Float32Array(rate * 16);
    const period = Math.round((60 / bpm) * rate);
    for (let at = 0; at < samples.length; at += period) {
      for (let i = 0; i < 400 && at + i < samples.length; i++) samples[at + i] = Math.sin(i * 0.9) * Math.exp(-i / 80);
    }
    const estimate = estimateTempo(samples, rate).bpm;
    check(`tempo of a ${bpm} BPM click track`, Math.abs(estimate - bpm) / bpm < 0.03, `estimated ${estimate.toFixed(1)}`);
  }
  const wav = encodeWavFloat(Float32Array.from([0.25, -0.5, 1, 0]), 48000);
  const decoded = decodeWav(wav);
  check("wav32 encode and decode", decoded.rate === 48000 && decoded.samples.join() === "0.25,-0.5,1,0");
  const a = Float32Array.from({ length: 100 }, (_, i) => Math.sin(i / 3));
  check("correlation of a signal with itself", Math.abs(correlation(a, a) - 1) < 1e-9);
  check("correlation of a signal with its inverse", Math.abs(correlation(a, a.map((v) => -v)) + 1) < 1e-9);
  const level = levelDifferenceOutside(new Float32Array(1000).fill(0.5), new Float32Array(1000).fill(0.25), 100, 3, 5);
  check("level difference of a half-amplitude copy", Math.abs(level.db + 6.02) < 0.01, `${level.db.toFixed(2)} dB`);
  const boundary = "ace-batch-boundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: audio/wav\r\n\r\n`), Buffer.from([1, 2, 3, 13, 10]), Buffer.from("\r\n"),
    Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Disposition: form-data; name="latent"\r\n\r\n`), Buffer.from([9, 9]), Buffer.from("\r\n"),
    Buffer.from(`--${boundary}--\r\n`)
  ]);
  const parts = parseMultipartMixed(body);
  check("multipart/mixed split keeps binary bytes", parts.length === 2 && parts[0].type === "audio/wav" && parts[0].data.join() === "1,2,3,13,10" && parts[1].data.join() === "9,9");
  return failures.length === 0;
}

function parseArgs(argv) {
  const options = {
    url: "http://127.0.0.1:8085",
    pid: null,
    turbo: "acestep-v15-turbo-Q8_0.gguf",
    base: "acestep-v15-base-Q8_0.gguf",
    lm: "acestep-5Hz-lm-4B-Q8_0.gguf",
    tempoRuns: 10,
    only: [...STEPS],
    out: null,
    dryRun: false,
    selfTest: false,
    help: false
  };
  const value = (i) => {
    if (i + 1 >= argv.length) throw new Error(`${argv[i]} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--url": options.url = value(i++); break;
      case "--pid": options.pid = Number(value(i++)); break;
      case "--turbo": options.turbo = value(i++); break;
      case "--base": options.base = value(i++); break;
      case "--lm": options.lm = value(i++); break;
      case "--tempo-runs": options.tempoRuns = Number(value(i++)); break;
      case "--only": options.only = value(i++).split(",").map((s) => s.trim()); break;
      case "--out": options.out = value(i++); break;
      case "--dry-run": options.dryRun = true; break;
      case "--self-test": options.selfTest = true; break;
      case "--help": case "-h": options.help = true; break;
      default: throw new Error(`Unknown option ${argv[i]}`);
    }
  }
  const unknown = options.only.filter((s) => !STEPS.includes(s));
  if (unknown.length > 0) throw new Error(`Unknown step ${unknown.join(", ")}. Steps: ${STEPS.join(", ")}`);
  if (!Number.isInteger(options.tempoRuns) || options.tempoRuns < 1) throw new Error("--tempo-runs must be a positive integer");
  return options;
}

function printTable(rows) {
  const header = ["Exit", "Measurement", "Result", "Note"];
  const all = [header, ...rows];
  const widths = header.map((_, c) => Math.max(...all.map((r) => String(r[c]).length)));
  for (const [i, row] of all.entries()) {
    console.log(row.map((cell, c) => String(cell).padEnd(widths[c])).join("  ").trimEnd());
    if (i === 0) console.log(widths.map((w) => "-".repeat(w)).join("  "));
  }
}

function usage() {
  const source = new URL(import.meta.url);
  return `Usage: node ${source.pathname.split("/").slice(-3).join("/")} [options]\n\nMM0 backend spike for the music mode. Needs a running acestep.cpp ace-server (see the header of this file).\nOptions: --url URL, --pid N, --turbo NAME, --base NAME, --lm NAME, --tempo-runs N,\n         --only runtime,swap,tempo,signature,level,lego,batch, --out DIR, --dry-run, --self-test, --help\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (options.selfTest) return selfTest() ? 0 : 1;
  if (options.dryRun) {
    console.log(`Planned requests against ${options.url} (nothing is sent):\n`);
    for (const line of plan(options)) {
      console.log(`[exit ${line.item}] ${line.endpoint}\n  ${line.note}\n  ${JSON.stringify(line.body)}\n`);
    }
    console.log("Also: GET /props before the run (lists the models the server found; exit item 7).");
    return 0;
  }
  const client = new AceServerClient(options.url);
  const rows = [];
  let failed = false;
  try {
    const props = await client.props();
    console.log(`ace-server ${props.version}, models: ${JSON.stringify(props.models)}, max_batch ${props.cli?.max_batch}`);
    for (const [name, files] of [["turbo", options.turbo], ["base", options.base], ["lm", options.lm]]) {
      const all = Object.values(props.models ?? {}).flat();
      if (!all.includes(files)) throw new Error(`The server has no ${name} model named ${files}. It lists ${all.join(", ") || "none"}.`);
    }
    if ((props.cli?.max_batch ?? 1) < 2) throw new Error("Start ace-server with --max-batch 2: two candidates need lm_batch_size 2.");
    await runSteps(client, options, rows);
  } catch (error) {
    failed = true;
    rows.push(["-", "run aborted", "error", error instanceof Error ? error.message : String(error)]);
  }
  printTable(rows);
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then((code) => process.exit(code), (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
