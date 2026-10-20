#!/usr/bin/env node
// Records the RIDGELINE completion route: an autopilot takes off, follows the
// racing line from course.json through all 13 gates and finishes on the low
// pass. It only produces stick, throttle, brake and gear inputs, the same frames
// a player sends, so the recording replays through any session.
//
//   node packages/game-runtime/samples/ridgeline/tools/record_route.mjs MEDIA_DIR
//
// The route is flown one leg at a time, gate to gate. Each leg starts from the
// snapshot taken as the previous gate passed and tries the gain sets in
// CANDIDATES until one threads the gate. The finished recording is then replayed
// from tick 0 in one session, and it is written only if that replay passes every
// gate in order without a crash. VERBOSE=1 reports each failed attempt.
// CHECKPOINTS=DIR keeps every leg's checkpoint, and RESUME=N starts from the one
// before gate N + 1, to iterate on a late leg.
//
// Writes completion.inputs.json and completion.assertions.json beside game.json.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gameDocument3D, gameInputFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D, decodePreparedGameCollider3D } from "@nodetool-ai/game-runtime";

const SAMPLE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const media = process.argv[2];
if (!media) throw new Error("usage: record_route.mjs MEDIA_DIR");
const course = JSON.parse(readFileSync(path.join(media, "course.json"), "utf8"));
const document = gameDocument3D.parse(JSON.parse(readFileSync(path.join(SAMPLE, "game.json"), "utf8")));
const resolveCollider = async (binding) =>
  decodePreparedGameCollider3D(new Uint8Array(readFileSync(path.join(SAMPLE, "assets", `${binding.assetId}.json`))), binding);

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => mul(a, 1 / Math.max(len(a), 1e-9));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rotate = (q, v) => {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
};

const line = course.line;
const STEP = len(sub(line[1], line[0]));
// The line index nearest each gate. A leg fails once the jet is 400 m past its gate without passing it.
const gateIndex = course.gates.map((gate) => line.reduce((best, point, k) => (len(sub(point, gate.p)) < len(sub(line[best], gate.p)) ? k : best), 0));
const CANYON_END = Math.round(line.length * 0.48);

function pilot(state, gains) {
  const { jet } = state;
  const p = [jet.transform.position.x, jet.transform.position.y, jet.transform.position.z];
  const v = [jet.velocity.x, jet.velocity.y, jet.velocity.z];
  const q = jet.transform.rotation;
  const F = rotate(q, [0, 0, -1]), U = rotate(q, [0, 1, 0]), R = rotate(q, [1, 0, 0]);
  const speed = len(v);
  const frame = { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } };
  const holdThrottle = (target) => {
    frame.axes.throttle = clamp((target - state.throttle) * 8, -1, 1);
    state.throttle = clamp(state.throttle + frame.axes.throttle * 0.55 / 60, 0, 1);
  };

  if (state.phase === "roll") {
    // Full afterburner down the centreline, nose wheel steering on the yaw axis.
    holdThrottle(1);
    frame.axes.yaw = clamp(-p[0] * 0.08 - F[0] * 3, -1, 1);
    if (speed > 72) frame.axes.pitch = clamp((0.2 - Math.asin(F[1])) * 4, -1, 1);
    if (p[1] > 80) { state.phase = "climb"; frame.justPressed.push("gear"); }
    return frame;
  }

  // Track the racing line: steer the velocity onto the line's tangent, close the cross-track error, and feed
  // forward the line's curvature half a second ahead. Gates sit on the line, so holding it threads them.
  for (let k = state.along; k < Math.min(state.along + 40, line.length - 2); k += 1) {
    if (len(sub(line[k], p)) < len(sub(line[state.along], p))) state.along = k;
  }
  const at = Math.max(1, Math.min(state.along, line.length - 2));
  const tangentAt = (k) => norm(sub(line[Math.min(k + 1, line.length - 1)], line[Math.max(k - 1, 0)]));
  const t0 = tangentAt(at);
  const ahead = clamp(Math.round(speed * 0.5 / STEP), 1, 20);
  const t1 = tangentAt(Math.min(at + ahead, line.length - 2));
  const curvature = mul(sub(t1, t0), speed * speed / (ahead * STEP));
  const offset = sub(line[at], p);
  const crossTrack = sub(offset, mul(t0, dot(offset, t0)));
  state.integral = add(mul(state.integral, 0.998), mul(crossTrack, 1 / 60));
  if (len(state.integral) > 60) state.integral = mul(norm(state.integral), 60);
  const accel = add(add(add(curvature, mul(crossTrack, gains.KX)), mul(state.integral, gains.KI)), mul(sub(mul(t0, speed), v), gains.KV));
  const vhat = norm(v);
  // Stay upright: push over for a descent instead of rolling inverted to pull down.
  const lift = add(accel, [0, 9.81, 0]);
  lift[1] = Math.max(lift[1], gains.LF);
  const liftPerp = sub(lift, mul(vhat, dot(lift, vhat)));
  // Bank angles about the nose, positive to the right, measured from the horizon so a reversal never rolls
  // through inverted. The wanted bank points the lift where the path needs it, within the leg's bank limit.
  const rightLevel = norm(cross(F, [0, 1, 0]));
  const upLevel = cross(rightLevel, F);
  const bank = Math.atan2(dot(U, rightLevel), dot(U, upLevel));
  const bankWanted = clamp(Math.atan2(dot(liftPerp, rightLevel), Math.max(dot(liftPerp, upLevel), gains.VF * 9.81)), -gains.BL, gains.BL);
  const bankError = bankWanted - bank;
  frame.axes.roll = clamp(bankError * gains.KR, -1, 1);
  const pathRate = dot(sub(accel, mul(vhat, dot(accel, vhat))), U) / Math.max(speed, 40);
  const rateLimit = Math.min(0.62, 8 * 9.81 / Math.max(speed, 40));
  frame.axes.pitch = clamp(pathRate / rateLimit * gains.KP * Math.max(0, Math.cos(bankError)), -1, 1);
  // Slow down for the tightest turn in the next three seconds, so no turn needs more than the leg's g limit.
  let radius = Infinity;
  for (let k = at; k < Math.min(at + Math.round(speed * 3 / STEP), line.length - 4); k += 1) {
    const turn = Math.acos(clamp(dot(norm(sub(line[k + 2], line[k])), norm(sub(line[k + 4], line[k + 2]))), -1, 1));
    radius = Math.min(radius, 2 * STEP / Math.max(turn, 1e-6));
  }
  const cruise = Math.min(gains.speed, Math.sqrt(gains.G * 9.81 * radius));
  holdThrottle(clamp(0.55 + (cruise - speed) * 0.04, 0.15, 1));
  if (speed > cruise + 12) { frame.pressed.push("brake"); }
  if (state.phase === "climb" && p[1] > 120) state.phase = "line";
  return frame;
}

// Gains for one leg between gates. The recorder tries them in order and keeps the first set that threads the gate.
const BASE = { KX: 0.8, KI: 0.2, KV: 1.6, KR: 0.8, KP: 1.4, VF: 0, LF: 4, BL: 1.45, G: 6 };
const CANDIDATES = [
  {}, { KR: 1.3 }, { speed: -15 }, { KR: 1.3, speed: -15 }, { VF: 0.5, LF: -30 }, { KP: 1.8, KR: 1.3 },
  { KX: 1.2, KV: 2, KR: 1.3 }, { speed: 10 }, { speed: -25, KR: 1.3 }, { VF: 0.5, LF: -30, speed: -15 },
  { G: 4.5 }, { G: 4.5, KR: 1.3 }, { G: 3.5, KR: 1.3 },
  // Past knife edge: a descending turn that rolls beyond 90 degrees and pulls the nose down.
  { LF: -15, BL: 2.1, KR: 1.3 }, { LF: -15, BL: 2.1, KR: 1.3, speed: -15 }, { LF: -30, BL: 2.4, KR: 1.3, speed: -15 }
];
const gainsFor = (candidate, index) => ({ ...BASE, ...candidate,
  speed: (gateIndex[index] < CANYON_END ? 165 : 150) + (candidate.speed ?? 0) });

/** Rounds stick axes to 0.01 and leaves out empty fields, so the recording stays small. It is what the sessions step. */
const compact = (frame) => {
  const axes = Object.fromEntries(Object.entries(frame.axes).map(([name, value]) => [name, Math.round(value * 100) / 100]).filter(([, value]) => value !== 0));
  return { pressed: frame.pressed, ...(frame.justPressed.length ? { justPressed: frame.justPressed } : {}), ...(Object.keys(axes).length ? { axes } : {}) };
};
const spawn = document.scenes[0].entities.find((entity) => entity.id === "jet").transform3d;
const observe = (state, result) => {
  // Inspecting the session every tick slows its scripts, so the pilot reads the render frame and derives velocity.
  const entity = result.frame.entities.find((candidate) => candidate.entityId === "jet");
  const p = entity.transform.position, q = entity.previousTransform.position;
  state.jet = { transform: entity.transform, velocity: { x: (p.x - q.x) * 60, y: (p.y - q.y) * 60, z: (p.z - q.z) * 60 } };
};
const transient = (error) => error instanceof Error && /budget exceeded|interrupted|Game script failed: $/.test(error.message);

/** Flies from a checkpoint until the next gate passes, or returns undefined when the jet crashes or misses it. */
async function flyLeg(checkpoint, index, gains) {
  const session = await createGameSession3D(document, 1, checkpoint.snapshot, { resolveCollider });
  const state = structuredClone(checkpoint.state);
  const frames = [];
  let closest = Infinity;
  try {
    for (let tick = checkpoint.tick; ; tick += 1) {
      const recorded = tick < 30 ? { pressed: [] } : compact(pilot(state, gains));
      frames.push(recorded);
      const frame = gameInputFrame3D.parse(recorded);
      const result = session.step(frame);
      observe(state, result);
      const triggers = result.events.filter((event) => event.kind === "trigger").map((event) => event.event);
      const at = state.jet.transform.position;
      closest = Math.min(closest, Math.hypot(at.x - course.gates[index].p[0], at.y - course.gates[index].p[1], at.z - course.gates[index].p[2]));
      if (triggers.includes("crash") || state.along > gateIndex[index] + 20) {
        if (process.env.VERBOSE) { console.log(`  ${course.gates[index].id} ${JSON.stringify(gains)}: ${triggers.includes("crash") ? "crash" : "miss"} at tick ${result.tick}, closest ${closest.toFixed(0)} m`); }
        return undefined;
      }
      if (triggers.includes("gate") || triggers.includes("victory")) {
        return { tick: result.tick, frames: [...checkpoint.frames, ...frames], state, snapshot: session.snapshot(), victory: triggers.includes("victory") };
      }
    }
  } finally { session.dispose(); }
}

const CACHE = process.env.CHECKPOINTS;
let checkpoint = { tick: 0, frames: [], snapshot: undefined,
  state: { along: 0, phase: "roll", throttle: 0, integral: [0, 0, 0],
    jet: { transform: { position: spawn.position, rotation: spawn.rotation }, velocity: { x: 0, y: 0, z: 0 } } } };
const legs = [];
let first = 0;
// CHECKPOINTS=dir keeps each gate's checkpoint, and RESUME=<gate index> starts from one, to iterate on a late leg.
if (CACHE && process.env.RESUME) {
  first = Number(process.env.RESUME);
  checkpoint = JSON.parse(readFileSync(path.join(CACHE, `${first - 1}.json`), "utf8"));
}
for (let index = first; index < course.gates.length; index += 1) {
  let next;
  for (const candidate of CANDIDATES.slice(0, Number(process.env.CANDIDATES ?? CANDIDATES.length))) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { next = await flyLeg(checkpoint, index, gainsFor(candidate, index)); break; } catch (error) {
        if (!transient(error)) { throw error; }
        // A script that runs past its time budget on a loaded machine fails the attempt, not the gains.
      }
    }
    if (next) { legs.push({ gate: course.gates[index].id, tick: next.tick, gains: candidate }); break; }
  }
  if (!next) { throw new Error(`No gains thread ${course.gates[index].id}`); }
  console.log(`${course.gates[index].id} at tick ${next.tick} with ${JSON.stringify(legs.at(-1).gains)}`);
  checkpoint = next;
  if (CACHE) { writeFileSync(path.join(CACHE, `${index}.json`), JSON.stringify(checkpoint)); }
}
if (!checkpoint.victory) { throw new Error("The last gate did not finish the race"); }
// A short hold after the finish lets the banner and the finish mix play out.
const frames = [...checkpoint.frames];
{
  const state = checkpoint.state;
  const gains = gainsFor({}, course.gates.length - 1);
  for (let tick = 0; tick < 120; tick += 1) {
    frames.push(compact(pilot(state, gains)));
  }
}

// Replays the whole recording from tick 0 in one session, as the tests and the capture do.
const session = await createGameSession3D(document, 1, undefined, { resolveCollider });
const gates = [];
const crashes = [];
let victory = -1;
try {
  for (const frame of frames) {
    const result = session.step(gameInputFrame3D.parse(frame));
    for (const event of result.events) {
      if (event.kind !== "trigger") { continue; }
      if (event.event === "gate") { gates.push([result.tick, event.target?.entityId]); }
      if (event.event === "crash") { crashes.push(result.tick); }
      if (event.event === "victory") { victory = result.tick; }
    }
  }
  console.log(JSON.stringify({ ticks: frames.length, gates, crashes, victory, finish: session.snapshot().ui?.["finish-time"]?.text }));
} finally { session.dispose(); }
if (victory < 0 || crashes.length > 0 || gates.map(([, id]) => id).join() !== course.gates.map((gate) => gate.id).join()) {
  throw new Error("The replayed recording does not complete the course cleanly");
}
writeFileSync(path.join(SAMPLE, "completion.inputs.json"), `${JSON.stringify(frames)}\n`);
writeFileSync(path.join(SAMPLE, "completion.assertions.json"), `${JSON.stringify({ tolerance: 0.05, ticks: [{ tick: victory, events: [{ kind: "trigger", event: "victory", entityId: "jet" }] }] }, null, 2)}\n`);
