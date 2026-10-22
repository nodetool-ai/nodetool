import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COURSE, RACER_COLORS } from "./course.mjs";

// The viewport controls both world rendering and full-canvas HUD uploads.
export const GAME_VIEWPORT = { aspectRatio: 16 / 9, hudWidth: 1024, hudHeight: 576 };
const HUD_SCALE = GAME_VIEWPORT.hudWidth / 1280;

const SAMPLE = fileURLToPath(new URL("../", import.meta.url));
const COLORS = { ink: "#102B3B", panel: "#16394B", muted: "#A4BDC4", cream: "#FFF5DA", coral: "#FF6844", aqua: "#67DCCB", gold: "#FFD052" };
const RATE = 32000;

function cueSynthesizer(duration) {
  const length = Math.round(duration * RATE);
  const left = new Float64Array(length);
  const right = new Float64Array(length);
  let seed = 63491;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  const add = (at, seconds, midi, gain, timbre, pan = 0) => {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const frames = Math.round(seconds * RATE);
    const offset = Math.round(at * RATE);
    const leftGain = Math.sqrt((1 - pan) / 2) * gain;
    const rightGain = Math.sqrt((1 + pan) / 2) * gain;
    let phase = 0;
    let previousNoise = 0;
    for (let i = 0; i < frames; i += 1) {
      const index = offset + i;
      if (index >= length) { break; }
      const t = i / RATE;
      const fade = Math.min(1, t / 0.004) * Math.min(1, (seconds - t) / 0.018);
      phase += 2 * Math.PI * frequency / RATE;
      let sample;
      if (timbre === "kick") {
        sample = Math.sin(2 * Math.PI * (44 * t + 5 * (1 - Math.exp(-t * 32)))) * Math.exp(-t * 13);
      } else if (timbre === "snare" || timbre === "hat" || timbre === "rush") {
        const noise = random();
        const high = noise - previousNoise;
        previousNoise = noise;
        sample = timbre === "snare"
          ? (noise * 0.65 + Math.sin(2 * Math.PI * 190 * t) * 0.35) * Math.exp(-t * 22)
          : high * Math.exp(-t * (timbre === "hat" ? 65 : 3)) * 0.5;
      } else if (timbre === "bass") {
        sample = (Math.sin(phase) + 0.28 * Math.sin(phase * 2)) * Math.exp(-t * 5);
      } else if (timbre === "brass") {
        sample = (Math.sin(phase + 0.025 * Math.sin(32 * t)) + 0.36 * Math.sin(phase * 2) + 0.18 * Math.sin(phase * 3)) * Math.min(1, t / 0.035) * Math.exp(-t * 2.7);
      } else if (timbre === "bell") {
        sample = (Math.sin(phase) + 0.25 * Math.sin(phase * 2.76) + 0.13 * Math.sin(phase * 5.4)) * Math.exp(-t * 6);
      } else if (timbre === "sweep") {
        sample = (Math.sin(phase * (1 + t * 1.8)) + 0.25 * random()) * Math.sin(Math.PI * t / seconds);
      } else {
        sample = (Math.sin(phase) + 0.23 * Math.sin(phase * 2) + 0.12 * Math.sin(phase * 3)) * Math.exp(-t * 8);
      }
      const target = index % length;
      left[target] += sample * fade * leftGain;
      right[target] += sample * fade * rightGain;
    }
  };
  const wav = () => {
    let peak = 0.001;
    for (let i = 0; i < length; i += 1) { peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i])); }
    const data = Buffer.alloc(44 + length * 4);
    data.write("RIFF", 0);
    data.writeUInt32LE(data.length - 8, 4);
    data.write("WAVEfmt ", 8);
    data.writeUInt32LE(16, 16);
    data.writeUInt16LE(1, 20);
    data.writeUInt16LE(2, 22);
    data.writeUInt32LE(RATE, 24);
    data.writeUInt32LE(RATE * 4, 28);
    data.writeUInt16LE(4, 32);
    data.writeUInt16LE(16, 34);
    data.write("data", 36);
    data.writeUInt32LE(length * 4, 40);
    for (let i = 0; i < length; i += 1) {
      data.writeInt16LE(Math.round(left[i] / peak * 28000), 44 + i * 4);
      data.writeInt16LE(Math.round(right[i] / peak * 28000), 46 + i * 4);
    }
    return data;
  };
  return { add, wav };
}

function cue(name) {
  const durations = { start: 0.6, countdown: 0.25, go: 0.65, drift: 0.45, boost: 0.85, pickup: 0.7, item: 0.55, hit: 0.55, lap: 1.1, finish: 2.4 };
  const sound = cueSynthesizer(durations[name]);
  if (name === "boost" || name === "item") {
    sound.add(0, durations[name], name === "boost" ? 53 : 65, 0.6, "sweep");
    sound.add(0, 0.3, 36, 0.45, "kick");
  } else if (name === "hit") {
    sound.add(0, 0.45, 40, 0.6, "snare");
    sound.add(0, 0.4, 32, 0.8, "kick");
  } else {
    const melodies = { start: [72, 76, 79], countdown: [76], go: [84, 88, 91], drift: [81, 84], pickup: [79, 84, 88, 91], lap: [76, 79, 84, 88], finish: [72, 76, 79, 84, 79, 84] };
    melodies[name].forEach((note, index) => sound.add(index * (name === "finish" ? 0.22 : 0.08), name === "finish" ? 1.1 : 0.35, note, 0.35, name === "finish" ? "brass" : "bell"));
  }
  return sound.wav();
}

function createUi() {
  const nodes = [];
  const place = (id, parent, x, y) => ({ id, ...(parent ? { parent } : {}), anchor: { x: 0, y: 0 }, offset: { x, y } });
  const panel = (id, parent, x, y, width, height, color = COLORS.ink, extra = {}) => nodes.push({ kind: "panel", ...place(id, parent, x, y), width, height, color, cornerRadius: 12, ...extra });
  const text = (id, parent, x, y, value, size = 16, color = COLORS.cream, display = false, extra = {}) => nodes.push({ kind: "text", ...place(id, parent, x, y), text: value, size, color, fontId: display ? "font-display" : "font-ui", ...extra });
  const button = (id, parent, x, y, width, value, action) => nodes.push({ kind: "button", ...place(id, parent, x, y), width, height: 58, text: value, action, size: 22, background: COLORS.coral, color: COLORS.ink, fontId: "font-ui" });
  const bar = (id, parent, x, y, width, height, color) => nodes.push({ kind: "bar", ...place(id, parent, x, y), width, height, value: 0, max: 1, color, background: COLORS.panel });

  panel("race-root", null, 0, 0, 1, 1, COLORS.ink, { visible: false, cornerRadius: 0 });
  panel("rank-panel", "race-root", 28, 28, 160, 104);
  panel("rank-accent", "race-root", 28, 28, 5, 104, COLORS.coral, { cornerRadius: 0 });
  text("rank", "race-root", 47, 36, "6", 78, COLORS.cream, true);
  text("rank-suffix", "race-root", 91, 50, "TH", 24, COLORS.coral, true);
  text("rank-total", "race-root", 94, 87, "OF 6", 13, COLORS.muted);
  text("race-brand", "race-root", 211, 34, "SUNRUSH KART", 27, COLORS.cream, true);
  text("race-cup", "race-root", 211, 66, "COASTLINE CUP", 11, COLORS.cream);
  panel("lap-panel", "race-root", 1038, 28, 214, 104);
  text("lap-label", "race-root", 1056, 44, "LAP", 12, COLORS.muted);
  text("lap", "race-root", 1056, 64, "1 / 3", 43, COLORS.cream, true);
  text("time-label", "race-root", 1156, 44, "TIME", 12, COLORS.muted);
  text("time", "race-root", 1156, 75, "0:00.0", 24, COLORS.cream, true);

  panel("map-panel", "race-root", 1068, 150, 184, 185, COLORS.ink, { opacity: 0.84 });
  text("map-label", "race-root", 1083, 162, "CORAL COAST", 11, COLORS.muted);
  const minX = Math.min(...COURSE.map(p => p[0]));
  const maxX = Math.max(...COURSE.map(p => p[0]));
  const minZ = Math.min(...COURSE.map(p => p[2]));
  const maxZ = Math.max(...COURSE.map(p => p[2]));
  const scale = Math.min(145 / (maxX - minX), 132 / (maxZ - minZ));
  const map = { x: 1092, y: 188, minX, minZ, scale };
  COURSE.filter((_, index) => index % 3 === 0).forEach((p, index) => panel(`map-road-${index}`, "race-root", map.x + (p[0] - minX) * scale - 3, map.y + (p[2] - minZ) * scale - 3, 6, 6, COLORS.muted, { cornerRadius: 3 }));
  const first = COURSE[0];
  panel("map-start", "race-root", map.x + (first[0] - minX) * scale - 4, map.y + (first[2] - minZ) * scale - 2, 8, 4, COLORS.cream, { cornerRadius: 0 });

  panel("item-panel", "race-root", 28, 570, 226, 122);
  text("item-label", "race-root", 46, 584, "ITEM", 12, COLORS.muted);
  text("item", "race-root", 46, 605, "—", 34, COLORS.gold, true);
  text("item-help", "race-root", 46, 655, "DRIVE THROUGH A CRATE", 10, COLORS.muted);
  panel("speed-panel", "race-root", 1068, 586, 184, 106);
  text("speed", "race-root", 1086, 594, "0", 68, COLORS.cream, true);
  text("speed-unit", "race-root", 1188, 658, "KM/H", 12, COLORS.muted);
  bar("speed-bar", "race-root", 1087, 676, 147, 4, COLORS.coral);
  panel("charge-panel", "race-root", 474, 620, 332, 72);
  text("charge-label", "race-root", 492, 632, "HOLD SHIFT + STEER TO DRIFT", 11, COLORS.muted);
  bar("drift-bar", "race-root", 492, 654, 296, 8, COLORS.aqua);
  bar("boost-bar", "race-root", 492, 668, 296, 4, COLORS.coral);
  text("race-controls", "race-root", 331, 700, "WASD DRIVE   SHIFT DRIFT   SPACE ITEM   R RECOVER   P PAUSE", 10, COLORS.cream);
  text("feedback", "race-root", 350, 552, "", 38, COLORS.cream, true, { width: 580, align: "center" });
  text("offroad", "race-root", 350, 595, "", 13, COLORS.gold, false, { width: 580, align: "center" });

  panel("title", null, 0, 0, 480, 720, COLORS.ink, { cornerRadius: 0 });
  panel("title-edge", "title", 472, 0, 8, 720, COLORS.coral, { cornerRadius: 0 });
  text("title-edition", "title", 48, 48, "THE COASTLINE CUP", 14, COLORS.aqua);
  text("title-sunrush", "title", 43, 107, "SUNRUSH", 112, COLORS.cream, true);
  text("title-kart", "title", 43, 208, "KART", 148, COLORS.coral, true);
  text("title-tagline", "title", 48, 362, "CHASE THE SUN. OWN THE CORNERS.", 12, COLORS.cream);
  panel("title-rule", "title", 48, 403, 380, 1, COLORS.muted, { cornerRadius: 0, opacity: 0.35 });
  text("title-specs", "title", 48, 425, "6 RACERS     3 LAPS     ONE COAST", 12, COLORS.muted);
  button("start-button", "title", 48, 469, 380, "START RACE  →", "start");
  text("title-start-help", "title", 48, 541, "ENTER / GAMEPAD A TO START", 11, COLORS.aqua);
  text("title-controls-1", "title", 48, 585, "WASD / ARROWS   Drive and brake", 12, COLORS.cream);
  text("title-controls-2", "title", 48, 610, "SHIFT   Drift       SPACE / E   Use item", 12, COLORS.cream);
  text("title-controls-3", "title", 48, 635, "R   Recover    Q   Look back    P / ESC   Pause", 12, COLORS.muted);
  text("title-controls-4", "title", 48, 674, "GAMEPAD   Stick steer · RT gas · LT brake", 10, COLORS.muted);
  text("title-controls-5", "title", 48, 692, "A drift · X item · B look back · Y recover", 10, COLORS.muted);
  panel("title-badge", "title", 1068, 632, 184, 60, COLORS.cream);
  text("title-badge-1", "title", 1084, 643, "CORAL COAST", 25, COLORS.ink, true);
  text("title-badge-2", "title", 1084, 674, "GRAND PRIX  /  01", 9, COLORS.ink);

  panel("countdown-panel", null, 560, 245, 160, 164, COLORS.ink, { visible: false });
  text("countdown", "countdown-panel", 0, 8, "3", 112, COLORS.gold, true, { width: 160, align: "center" });
  text("countdown-label", "countdown-panel", 0, 132, "GET READY", 11, COLORS.cream, false, { width: 160, align: "center" });

  panel("pause", null, 430, 232, 420, 246, COLORS.ink, { visible: false });
  text("pause-title", "pause", 0, 28, "PIT STOP", 58, COLORS.cream, true, { width: 420, align: "center" });
  text("pause-caption", "pause", 0, 106, "YOUR RACE IS PAUSED", 12, COLORS.muted, false, { width: 420, align: "center" });
  button("resume-button", "pause", 48, 157, 324, "RESUME RACE", "pause");

  panel("results", null, 330, 64, 620, 592, COLORS.ink, { visible: false });
  panel("results-stripe", "results", 0, 0, 620, 6, COLORS.coral, { cornerRadius: 0 });
  text("results-label", "results", 32, 30, "COASTLINE CUP  /  RESULTS", 12, COLORS.aqua);
  text("results-title", "results", 30, 61, "RACE COMPLETE", 62, COLORS.cream, true);
  text("results-time", "results", 32, 140, "", 17, COLORS.gold);
  for (let i = 0; i < 6; i += 1) {
    panel(`result-row-${i}`, "results", 32, 190 + i * 43, 556, 37, i % 2 === 0 ? COLORS.panel : COLORS.ink, { cornerRadius: 5 });
    text(`result-${i}`, "results", 48, 199 + i * 43, "", 15, COLORS.cream);
  }
  button("retry-button", "results", 32, 481, 556, "RACE AGAIN  →", "start");
  text("results-footer", "results", 32, 555, "ENTER / GAMEPAD A    TAKE ANOTHER SHOT AT THE CUP", 10, COLORS.muted);
  for (const node of nodes) {
    for (const field of ["width", "height", "size", "cornerRadius"]) {
      if (node[field] !== undefined) { node[field] *= HUD_SCALE; }
    }
    node.offset.x *= HUD_SCALE;
    node.offset.y *= HUD_SCALE;
  }
  return { ui: { safeArea: true, focusNavigation: true, nodes }, map };
}

/** Builds native HUD widgets and installs the original score, effects, and OFL fonts. */
export async function createPresentation({ assetsDir }) {
  await mkdir(assetsDir, { recursive: true });
  const assets = {};
  const bind = async (slot, bytes, mediaKind, extension, extra = {}) => {
    const digest = createHash("sha256").update(bytes).digest("hex");
    const assetId = digest.slice(0, 32);
    await writeFile(path.join(assetsDir, `${assetId}.${extension}`), bytes);
    assets[slot] = { mediaKind, assetId, digest, required: true, ...extra };
  };
  const { renderScore } = await import("./music.mjs");
  const score = await renderScore();
  await bind("score", score.bytes, "audio", "wav");
  for (const event of ["start", "countdown", "go", "drift", "boost", "pickup", "item", "hit", "lap", "finish"]) {
    await bind(`sfx-${event}`, cue(event), "audio", "wav");
  }
  for (const [slot, file] of [["font-display", "08e4623805102d819f58601e46e34564.ttf"], ["font-ui", "a4086a4489237efa15b5c697f19a6d4f.ttf"]]) {
    await bind(slot, await readFile(path.join(SAMPLE, "../ridgeline/assets", file)), "font", "ttf", { fontFormat: "ttf" });
  }
  const { ui, map } = createUi();
  const source = (await readFile(path.join(SAMPLE, "scripts/hud.js"), "utf8"))
    .replace("__MINIMAP__", JSON.stringify(map))
    .replace("__RACER_COLORS__", JSON.stringify(RACER_COLORS))
    .replace("__HUD_SCALE__", String(HUD_SCALE));
  const entities = [{ id: "presentation", name: "Race presentation", transform3d: { position: { x: 0, y: 0, z: 0 } }, behaviors: [{ kind: "script", source, maxTickMs: 20, maxCommands: 64 }] }];
  const volumes = { start: 0.48, countdown: 0.5, go: 0.6, drift: 0.3, boost: 0.4, pickup: 0.45, item: 0.45, hit: 0.45, lap: 0.6, finish: 0.75 };
  for (const [event, volume] of Object.entries(volumes)) {
    entities.push({ id: `sound-${event}`, transform3d: { position: { x: 0, y: 0, z: 0 } }, audioSource: { assetId: `sfx-${event}`, onEvent: event, volume } });
  }
  const audio = {
    mixer: {
      buses: { music: { volume: 0.36 }, sfx: { volume: 0.85 }, ui: { volume: 0.8 } },
      assetBuses: Object.fromEntries(["start", "countdown", "go", "lap", "finish", "pickup"].map(event => [`sfx-${event}`, "ui"])),
      ducking: [{ bus: "music", when: "ui", gain: 0.65, attackTicks: 3, releaseTicks: 42 }],
      snapshots: { finish: { buses: { music: { volume: 0.22 } } } },
      transitions: [{ on: { kind: "trigger", event: "finish" }, snapshot: "finish", fadeTicks: 45 }, { on: { kind: "trigger", event: "start" }, snapshot: "base", fadeTicks: 30 }]
    }
  };
  return { assets, entities, ui, audio, viewport: GAME_VIEWPORT, music: { assetId: "score", volume: 0.7, fadeInTicks: 90, fadeOutTicks: 90 } };
}
