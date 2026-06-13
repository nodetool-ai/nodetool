/**
 * Field repro for realtime-audio dropouts in the REAL editor.
 *
 * Unlike the perf harness (which feeds the worklet directly and showed a
 * rock-steady buffer for 90s), this drives the actual app: real ReactFlow
 * canvas, the bespoke AudioOut node body (visualizer canvas, knobs), the
 * bus → effect → worklet delivery path, and whichever execution path
 * (browser worker or server WebSocket) the app actually picks.
 *
 * Requires the dev stack running (`make dev`: backend :7777 + vite :3000).
 *
 *   node web/scripts/repro-audio-dropout.mjs [durationSec=100]
 *
 * Prints, every 5s, the playback worklet's buffer level + underrun/drop
 * counters (from window.__nodetoolRealtimeAudio, fed by the worklet's 1 Hz
 * stats), plus any [realtime-audio] distress warnings and the run-path
 * console lines — enough to tell producer starvation, delivery jitter and
 * consumer drops apart.
 */
import { chromium } from "@playwright/test";

const API = "http://localhost:7777";
const APP = "http://localhost:3000";
const DURATION_S = Number(process.argv[2] ?? 100);

const graph = {
  nodes: [
    {
      id: "osc",
      parent_id: null,
      type: "nodetool.audio.synth.Oscillator",
      data: { waveform: "saw", frequency: 110, amplitude: 0.5 },
      ui_properties: { position: { x: 100, y: 100 } },
      dynamic_properties: {},
      dynamic_outputs: {},
      sync_mode: "on_any"
    },
    {
      id: "out",
      parent_id: null,
      type: "nodetool.audio.realtime.AudioOutput",
      data: {},
      ui_properties: { position: { x: 420, y: 100 } },
      dynamic_properties: {},
      dynamic_outputs: {},
      sync_mode: "on_any"
    }
  ],
  edges: [
    {
      id: "e1",
      source: "osc",
      sourceHandle: "chunk",
      target: "out",
      targetHandle: "chunk",
      ui_properties: null
    }
  ]
};

const res = await fetch(`${API}/trpc/workflows.create`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    json: {
      name: `repro-audio-dropout-${Date.now()}`,
      description: "1 osc -> audio out dropout repro",
      access: "private",
      graph
    }
  })
});
if (!res.ok) {
  console.error("workflow create failed:", res.status, await res.text());
  process.exit(1);
}
const workflow = (await res.json()).result.data.json;
console.log(`workflow ${workflow.id} created`);

const browser = await chromium.launch({
  headless: false,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

page.on("console", (msg) => {
  const text = msg.text();
  if (
    text.includes("[realtime-audio]") ||
    text.includes("[browserRunner]") ||
    text.toLowerCase().includes("dropout")
  ) {
    console.log(`  [console] ${text}`);
  }
});

await page.goto(`${APP}/editor/${workflow.id}`, {
  waitUntil: "domcontentloaded"
});
await page.waitForSelector(".react-flow__pane", { timeout: 60_000 });
// Let the canvas settle and node bodies mount.
await page.waitForTimeout(3000);

await page.click('[aria-label="Run workflow"]');
console.log(`run started; sampling for ${DURATION_S}s…`);

// CPU-profile the degradation window (the store's 1024-chunk rolling cap
// engages at ~22s; distress historically starts right there).
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
const profileWindow = { startS: 16, stopS: 26, started: false, done: false };

const t0 = Date.now();
let lastWarnCounts = "";
const samples = [];
let profile = null;
while ((Date.now() - t0) / 1000 < DURATION_S) {
  await page.waitForTimeout(2500);
  const elapsedS = (Date.now() - t0) / 1000;
  if (!profileWindow.started && elapsedS >= profileWindow.startS) {
    profileWindow.started = true;
    await cdp.send("Profiler.start");
    console.log("  [profiler] started");
  } else if (
    profileWindow.started &&
    !profileWindow.done &&
    elapsedS >= profileWindow.stopS
  ) {
    profileWindow.done = true;
    profile = (await cdp.send("Profiler.stop")).profile;
    console.log("  [profiler] stopped");
  }
  const stats = await page.evaluate(() => {
    const w = window;
    return {
      audio: w.__nodetoolRealtimeAudio ?? null,
      // rough main-thread health while sampling
      heap: performance.memory ? performance.memory.usedJSHeapSize : null
    };
  });
  const t = Math.round((Date.now() - t0) / 1000);
  const entries = Object.entries(stats.audio ?? {});
  if (entries.length === 0) {
    console.log(`t=${t}s  (no playback stats yet)`);
    continue;
  }
  for (const [id, s] of entries) {
    const line =
      `t=${t}s  [${id}] buffered=${s.buffered}f ` +
      `underruns=${s.underruns} dropped=${s.droppedFrames}f ` +
      `in=${s.framesIn} out=${s.framesOut} ` +
      `bus=${s.busChunks ?? 0} effect=${s.effectChunks ?? 0} ` +
      `maxGap=${s.maxDeliveryGapMs ?? 0}ms` +
      (stats.heap ? `  heap=${(stats.heap / 1048576).toFixed(0)}MB` : "");
    console.log(line);
    samples.push({ t, ...s });
    const counts = `${s.underruns}/${s.droppedFrames}`;
    if (lastWarnCounts && counts !== lastWarnCounts) {
      console.log(`  ^^ distress counters advanced`);
    }
    lastWarnCounts = counts;
  }
}

if (samples.length >= 2) {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  console.log("\n=== summary ===");
  console.log(`buffer slope: ${((last.buffered - first.buffered) / dt).toFixed(1)} frames/s`);
  console.log(`producer rate: ${((last.framesIn - first.framesIn) / dt).toFixed(1)} frames/s (expected 24000)`);
  console.log(`consumer rate: ${((last.framesOut - first.framesOut) / dt).toFixed(1)} frames/s`);
  console.log(`underruns: ${last.underruns}, dropped: ${last.droppedFrames} frames`);
}

if (profile) {
  // Top self-time functions in the degradation window.
  const hits = new Map();
  for (const node of profile.nodes) {
    if (!node.hitCount) continue;
    const f = node.callFrame;
    const url = (f.url || "").split("/").slice(-2).join("/");
    const key = `${f.functionName || "(anonymous)"} @ ${url}:${f.lineNumber}`;
    hits.set(key, (hits.get(key) ?? 0) + node.hitCount);
  }
  const total = [...hits.values()].reduce((a, b) => a + b, 0);
  console.log(`\n=== CPU profile t=${profileWindow.startS}-${profileWindow.stopS}s (top self-time) ===`);
  [...hits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .forEach(([k, v]) =>
      console.log(`${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`)
    );
}

await browser.close();
