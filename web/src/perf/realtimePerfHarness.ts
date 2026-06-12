/**
 * Realtime workflow perf harness (see perf-realtime.html).
 *
 * Runs a parametric modular-synth patch in the real browser-runner Web Worker
 * — the exact production path (kernel in worker, 16ms message batches,
 * deliverLocal on the main thread) — and measures what the editor would
 * experience, without mounting the editor:
 *
 *  - chunk throughput per output node vs the expected realtime rate
 *    (24000 Hz / 512-frame chunks ≈ 46.9 chunks/s per voice) — the realtime
 *    health signal: a CPU-bound worker falls below it
 *  - main-thread event-loop lag and long tasks while the stream runs
 *  - JS heap samples (Chrome) for leak/GC-churn detection
 *
 * Worker-side CPU/heap is sampled externally by the Playwright spec
 * (tests/benchmarks/realtime-perf.spec.ts) via worker.evaluate and CDP, so
 * this module needs no instrumentation hooks in production worker code.
 */
import {
  getBrowserWorkerReady,
  runBrowserGraphJobInWorker
} from "../lib/workflow/browserWorkerClient";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";

const SYNTH_SAMPLE_RATE = 24000;
const SYNTH_CHUNK_FRAMES = 512;

export interface PerfRunOptions {
  /** Number of synth voices. */
  voices?: number;
  /** How long to let the patch run before aborting it. */
  durationMs?: number;
  /**
   * Patch topology:
   *  - "voices": N independent chains (osc → low-pass → gain → audio out),
   *    one output stream each — scales transport/UI load linearly.
   *  - "complex": a real modular patch — master Gate clock, per voice a
   *    noise→S&H→Attenuverter random pitch CV, clocked FM + filter LFOs,
   *    ADSR→VCA, resonant VCF, all voices through a mixer tree → gain →
   *    high-pass → ONE output. ~9 nodes/voice, deep chains, fan-outs and
   *    several clock domains — stresses kernel scheduling and the
   *    zip-with-hold alignment paths.
   */
  patch?: "voices" | "complex";
  /**
   * Real playback: route the AudioOutput stream(s) into an actual
   * AudioContext + chunk-player worklet (live config, production defaults)
   * and collect the worklet's per-second buffer-health stats. This is the
   * only mode that exercises the audio-hardware clock — producer/consumer
   * clock skew is invisible without it. Requires an audio output device
   * (run the Playwright spec headed) and autoplay permission.
   */
  playback?: boolean;
}

export interface PlaybackStatsSample {
  /** ms since run start (main-thread clock). */
  t: number;
  buffered: number;
  underruns: number;
  droppedFrames: number;
  framesIn: number;
  framesOut: number;
}

export interface PerfRunSummary {
  voices: number;
  patch: "voices" | "complex";
  nodeCount: number;
  edgeCount: number;
  /** Number of AudioOutput streams (expected-rate basis). */
  outputStreams: number;
  durationMs: number;
  /** Audio-chunk output_updates received on the main thread, per node. */
  chunksPerNode: Record<string, number>;
  totalAudioChunks: number;
  totalSamples: number;
  /** Achieved vs expected chunk rate across all voices (1 = realtime). */
  chunkRateRatio: number;
  expectedChunksPerSecondPerVoice: number;
  messageCountsByType: Record<string, number>;
  /** Main-thread event-loop lag over-delay (ms) percentiles. */
  mainThreadLagMs: { p50: number; p95: number; max: number };
  /** PerformanceObserver longtask totals during the run. */
  longTasks: { count: number; totalMs: number };
  /** usedJSHeapSize stats (bytes); null when performance.memory is absent. */
  heap: {
    start: number;
    end: number;
    peak: number;
    /** Net heap growth rate — the memory-pressure signal on long runs. */
    growthMbPerMin: number;
    /** Sawtooth drops between samples (≥1MB) ≈ major GC events. */
    gcEvents: number;
    gcReclaimedMb: number;
  } | null;
  /** Worklet buffer-health timeline; null unless options.playback. */
  playback: {
    stats: PlaybackStatsSample[];
    underruns: number;
    droppedFrames: number;
    framesIn: number;
    framesOut: number;
    contextSampleRate: number;
  } | null;
  runError?: string;
}

interface GraphNode {
  [key: string]: unknown;
  id: string;
  type: string;
  properties: Record<string, unknown>;
}
interface GraphEdge {
  [key: string]: unknown;
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

/** V independent voices: Oscillator → StreamingLowPass → StreamingGain → AudioOutput. */
function buildPatch(voices: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (let i = 0; i < voices; i++) {
    const osc = `osc-${i}`;
    const lp = `lp-${i}`;
    const gain = `gain-${i}`;
    const out = `out-${i}`;
    nodes.push(
      {
        id: osc,
        type: "nodetool.audio.synth.Oscillator",
        properties: {
          waveform: "saw",
          frequency: 110 + 55 * i,
          amplitude: 0.5,
          sample_rate: SYNTH_SAMPLE_RATE
        }
      },
      {
        id: lp,
        type: "nodetool.audio.realtime.StreamingLowPass",
        properties: { cutoff_frequency_hz: 4000 }
      },
      {
        id: gain,
        type: "nodetool.audio.realtime.StreamingGain",
        properties: { gain_db: -12 }
      },
      { id: out, type: "nodetool.audio.realtime.AudioOutput", properties: {} }
    );
    const chain = [osc, lp, gain, out];
    for (let s = 0; s < chain.length - 1; s++) {
      edges.push({
        id: `e-${i}-${s}`,
        source: chain[s],
        sourceHandle: "chunk",
        target: chain[s + 1],
        targetHandle: "chunk"
      });
    }
  }
  return { nodes, edges };
}

/**
 * A full modular synth patch, Eurorack-style:
 *
 *   gate ──────────────┬─► adsr-v ─► vca-v.cv
 *                      ├─► lfo-fm-v.clock ─► osc-v.fm
 *                      ├─► lfo-cut-v.clock ─► vcf-v.cutoff_cv
 *                      └─► sh-v.trigger
 *   noise-v ─► sh-v.signal ─► att-v ─► osc-v.pitch_cv
 *   osc-v ─► vcf-v.audio ─► vca-v.audio ─► mixer tree ─► gain ─► hp ─► out
 *
 * One shared master clock; per-voice free-running noise generators add
 * independent clock domains, so the kernel's sample-FIFO hold-last paths get
 * exercised alongside the clocked, sample-aligned ones.
 */
function buildComplexPatch(voices: number): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let edgeSeq = 0;
  const connect = (
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string
  ): void => {
    edges.push({
      id: `e-${edgeSeq++}`,
      source,
      sourceHandle,
      target,
      targetHandle
    });
  };

  nodes.push({
    id: "gate",
    type: "nodetool.audio.synth.Gate",
    properties: { on_duration: 0.15, off_duration: 0.1, amplitude: 1 }
  });

  const voiceOuts: string[] = [];
  for (let v = 0; v < voices; v++) {
    const noise = `noise-${v}`;
    const sh = `sh-${v}`;
    const att = `att-${v}`;
    const lfoFm = `lfo-fm-${v}`;
    const lfoCut = `lfo-cut-${v}`;
    const osc = `osc-${v}`;
    const vcf = `vcf-${v}`;
    const adsr = `adsr-${v}`;
    const vca = `vca-${v}`;
    nodes.push(
      {
        id: noise,
        type: "nodetool.audio.synth.Oscillator",
        properties: { waveform: "noise", amplitude: 1 }
      },
      { id: sh, type: "nodetool.audio.synth.SampleHold", properties: {} },
      {
        id: att,
        type: "nodetool.audio.synth.Attenuverter",
        // Quantize-ish spread: each voice holds a different octave offset.
        properties: { scale: 1.5, offset: (v % 4) * 0.5 }
      },
      {
        id: lfoFm,
        type: "nodetool.audio.synth.LFO",
        properties: { waveform: "sine", rate_hz: 4 + v * 0.37, depth: 0.2 }
      },
      {
        id: lfoCut,
        type: "nodetool.audio.synth.LFO",
        properties: {
          waveform: "triangle",
          rate_hz: 0.15 + v * 0.07,
          depth: 0.5,
          offset: 0.5
        }
      },
      {
        id: osc,
        type: "nodetool.audio.synth.Oscillator",
        properties: {
          waveform: v % 2 === 0 ? "saw" : "square",
          frequency: 55 * Math.pow(2, v % 3),
          amplitude: 0.6,
          fm_amount: 0.3
        }
      },
      {
        id: vcf,
        type: "nodetool.audio.synth.VCF",
        properties: { mode: "lowpass", cutoff_hz: 800, q: 4, cv_amount: 3 }
      },
      {
        id: adsr,
        type: "nodetool.audio.synth.ADSR",
        properties: { attack: 0.01, decay: 0.08, sustain: 0.6, release: 0.12 }
      },
      { id: vca, type: "nodetool.audio.synth.VCA", properties: { gain: 1 } }
    );
    connect("gate", "cv", adsr, "gate");
    connect("gate", "cv", lfoFm, "clock");
    connect("gate", "cv", lfoCut, "clock");
    connect("gate", "cv", sh, "trigger");
    connect(noise, "chunk", sh, "signal");
    connect(sh, "cv", att, "signal");
    connect(att, "cv", osc, "pitch_cv");
    connect(lfoFm, "cv", osc, "fm");
    connect(osc, "chunk", vcf, "audio");
    connect(lfoCut, "cv", vcf, "cutoff_cv");
    connect(adsr, "cv", vca, "cv");
    connect(vcf, "chunk", vca, "audio");
    voiceOuts.push(vca);
  }

  // Mixer tree: fold streams 4-at-a-time until one remains.
  let stage = voiceOuts;
  let mixerSeq = 0;
  while (stage.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < stage.length; i += 4) {
      const group = stage.slice(i, i + 4);
      const mixer = `mixer-${mixerSeq++}`;
      nodes.push({
        id: mixer,
        type: "nodetool.audio.synth.Mixer",
        properties: { level1: 0.3, level2: 0.3, level3: 0.3, level4: 0.3 }
      });
      group.forEach((source, g) =>
        connect(source, "chunk", mixer, `in${g + 1}`)
      );
      next.push(mixer);
    }
    stage = next;
  }

  nodes.push(
    {
      id: "master-gain",
      type: "nodetool.audio.realtime.StreamingGain",
      properties: { gain_db: -6 }
    },
    {
      id: "master-hp",
      type: "nodetool.audio.realtime.StreamingHighPass",
      properties: { cutoff_frequency_hz: 40 }
    },
    { id: "out", type: "nodetool.audio.realtime.AudioOutput", properties: {} }
  );
  connect(stage[0], "chunk", "master-gain", "chunk");
  connect("master-gain", "chunk", "master-hp", "chunk");
  connect("master-hp", "chunk", "out", "chunk");

  return { nodes, edges };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length)
  );
  return sorted[idx];
}

function heapStats(
  samples: number[],
  elapsedMs: number
): PerfRunSummary["heap"] {
  if (samples.length === 0) return null;
  let gcEvents = 0;
  let gcReclaimed = 0;
  for (let i = 1; i < samples.length; i++) {
    const drop = samples[i - 1] - samples[i];
    if (drop >= 1024 * 1024) {
      gcEvents++;
      gcReclaimed += drop;
    }
  }
  const minutes = Math.max(elapsedMs / 60_000, 1e-6);
  return {
    start: samples[0],
    end: samples[samples.length - 1],
    peak: Math.max(...samples),
    growthMbPerMin:
      (samples[samples.length - 1] - samples[0]) / 1024 / 1024 / minutes,
    gcEvents,
    gcReclaimedMb: gcReclaimed / 1024 / 1024
  };
}

const heapBytes = (): number | null => {
  const mem = (
    performance as Performance & { memory?: { usedJSHeapSize: number } }
  ).memory;
  return mem ? mem.usedJSHeapSize : null;
};

export async function startPerfRun(
  options: PerfRunOptions = {}
): Promise<PerfRunSummary> {
  const voices = Math.max(1, Math.floor(options.voices ?? 8));
  const durationMs = Math.max(1000, Math.floor(options.durationMs ?? 10_000));
  const patch = options.patch ?? "voices";
  const { nodes, edges } =
    patch === "complex" ? buildComplexPatch(voices) : buildPatch(voices);
  const outputStreams = nodes.filter(
    (n) => n.type === "nodetool.audio.realtime.AudioOutput"
  ).length;

  // Worker init (module load, registry build) happens before measurement —
  // we measure the steady-state stream, not startup.
  await getBrowserWorkerReady();

  // Real playback sink: production worklet, production live config.
  const audioOutIds = new Set(
    nodes
      .filter((n) => n.type === "nodetool.audio.realtime.AudioOutput")
      .map((n) => n.id)
  );
  const playbackStats: PlaybackStatsSample[] = [];
  let playbackCtx: AudioContext | null = null;
  let playbackNode: AudioWorkletNode | null = null;
  const runStartRef = { t: 0 };
  if (options.playback) {
    playbackCtx = new AudioContext({
      sampleRate: SYNTH_SAMPLE_RATE,
      latencyHint: "interactive"
    });
    const { getChunkPlayerWorkletUrl } = await import(
      "../lib/audio/chunkPlayerWorkletUrl"
    );
    await playbackCtx.audioWorklet.addModule(getChunkPlayerWorkletUrl());
    playbackNode = new AudioWorkletNode(playbackCtx, "nodetool-chunk-player", {
      numberOfInputs: 0,
      outputChannelCount: [1]
    });
    playbackNode.connect(playbackCtx.destination);
    playbackNode.port.postMessage({
      type: "config",
      sampleRate: SYNTH_SAMPLE_RATE,
      channels: 1,
      live: true,
      primeSeconds: 0.04,
      maxLeadSeconds: 0.1
    });
    playbackNode.port.onmessage = (event: MessageEvent) => {
      const d = event.data as {
        type?: string;
        buffered?: number;
        underruns?: number;
        droppedFrames?: number;
        framesIn?: number;
        framesOut?: number;
      };
      if (d?.type !== "stats") return;
      playbackStats.push({
        t: Math.round(performance.now() - runStartRef.t),
        buffered: d.buffered ?? 0,
        underruns: d.underruns ?? 0,
        droppedFrames: d.droppedFrames ?? 0,
        framesIn: d.framesIn ?? 0,
        framesOut: d.framesOut ?? 0
      });
    };
    await playbackCtx.resume();
  }

  const chunksPerNode: Record<string, number> = {};
  const messageCountsByType: Record<string, number> = {};
  let totalAudioChunks = 0;
  let totalSamples = 0;

  const unsubscribe = globalWebSocketManager.subscribeEvent(
    "message",
    (message: unknown) => {
      const m = message as {
        type?: string;
        node_id?: string;
        value?: { type?: string; content_type?: string; content?: unknown };
      };
      const type = m.type ?? "unknown";
      messageCountsByType[type] = (messageCountsByType[type] ?? 0) + 1;
      if (
        type === "output_update" &&
        m.value?.type === "chunk" &&
        m.value.content_type === "audio"
      ) {
        const nodeId = m.node_id ?? "unknown";
        chunksPerNode[nodeId] = (chunksPerNode[nodeId] ?? 0) + 1;
        totalAudioChunks++;
        if (m.value.content instanceof Float32Array) {
          totalSamples += m.value.content.length;
          if (playbackNode && audioOutIds.has(nodeId)) {
            playbackNode.port.postMessage({
              type: "chunk",
              samples: m.value.content
            });
          }
        }
      }
    }
  );

  // Main-thread event-loop lag: how much later than scheduled each tick runs.
  const lagSamples: number[] = [];
  const TICK_MS = 20;
  let expectedTick = performance.now() + TICK_MS;
  const heapSamples: number[] = [];
  const startHeap = heapBytes();
  if (startHeap !== null) heapSamples.push(startHeap);
  const lagInterval = setInterval(() => {
    const now = performance.now();
    lagSamples.push(Math.max(0, now - expectedTick));
    expectedTick = now + TICK_MS;
    if (lagSamples.length % 25 === 0) {
      const h = heapBytes();
      if (h !== null) heapSamples.push(h);
    }
  }, TICK_MS);

  let longTaskCount = 0;
  let longTaskTotalMs = 0;
  let longTaskObserver: PerformanceObserver | null = null;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskCount++;
        longTaskTotalMs += entry.duration;
      }
    });
    longTaskObserver.observe({ entryTypes: ["longtask"] });
  } catch {
    // longtask observation unsupported — counts stay zero
  }

  const controller = new AbortController();
  const started = performance.now();
  runStartRef.t = started;
  const runPromise = runBrowserGraphJobInWorker({
    graph: { nodes, edges },
    jobId: `perf-${Date.now()}`,
    workflowId: "perf-realtime",
    signal: controller.signal
  });

  await new Promise((resolve) => setTimeout(resolve, durationMs));
  const elapsedMs = performance.now() - started;

  controller.abort();
  const result = await runPromise;

  clearInterval(lagInterval);
  longTaskObserver?.disconnect();
  unsubscribe();
  const lastPlayback = playbackStats[playbackStats.length - 1];
  try {
    playbackNode?.disconnect();
    await playbackCtx?.close();
  } catch {
    // playback teardown is best-effort
  }
  const endHeap = heapBytes();
  if (endHeap !== null) heapSamples.push(endHeap);

  const expectedChunksPerSecondPerVoice = SYNTH_SAMPLE_RATE / SYNTH_CHUNK_FRAMES;
  const expectedTotal =
    expectedChunksPerSecondPerVoice * outputStreams * (elapsedMs / 1000);
  lagSamples.sort((a, b) => a - b);

  return {
    voices,
    patch,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    outputStreams,
    durationMs: Math.round(elapsedMs),
    chunksPerNode,
    totalAudioChunks,
    totalSamples,
    chunkRateRatio: expectedTotal > 0 ? totalAudioChunks / expectedTotal : 0,
    expectedChunksPerSecondPerVoice,
    messageCountsByType,
    mainThreadLagMs: {
      p50: percentile(lagSamples, 50),
      p95: percentile(lagSamples, 95),
      max: lagSamples[lagSamples.length - 1] ?? 0
    },
    longTasks: { count: longTaskCount, totalMs: Math.round(longTaskTotalMs) },
    heap: heapStats(heapSamples, elapsedMs),
    playback:
      options.playback && playbackCtx
        ? {
            stats: playbackStats,
            underruns: lastPlayback?.underruns ?? 0,
            droppedFrames: lastPlayback?.droppedFrames ?? 0,
            framesIn: lastPlayback?.framesIn ?? 0,
            framesOut: lastPlayback?.framesOut ?? 0,
            contextSampleRate: playbackCtx.sampleRate
          }
        : null,
    // The harness ends every run by aborting the infinite patch — that
    // cancellation is the expected outcome, not a failure.
    runError:
      result.success || result.error === "Cancelled" ? undefined : result.error
  };
}

declare global {
  interface Window {
    __realtimePerf: { start: (opts?: PerfRunOptions) => Promise<PerfRunSummary> };
  }
}

const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

window.__realtimePerf = {
  start: async (opts?: PerfRunOptions) => {
    if (statusEl) statusEl.textContent = `running ${JSON.stringify(opts ?? {})}`;
    const summary = await startPerfRun(opts);
    if (statusEl) statusEl.textContent = "done";
    if (resultEl) resultEl.textContent = JSON.stringify(summary, null, 2);
    return summary;
  }
};

const params = new URLSearchParams(window.location.search);
if (params.get("autorun")) {
  void window.__realtimePerf.start({
    voices: Number(params.get("voices") ?? 8),
    durationMs: Number(params.get("durationMs") ?? 10_000),
    patch: params.get("patch") === "complex" ? "complex" : "voices",
    playback: params.get("playback") === "1"
  });
}
