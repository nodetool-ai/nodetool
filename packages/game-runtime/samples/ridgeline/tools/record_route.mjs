#!/usr/bin/env node
// Records the RIDGELINE completion route: an autopilot takes off, follows the
// racing line from course.json through all 13 gates and finishes on the low
// pass. It only produces stick, throttle and gear inputs, the same frames a
// player sends, so the recording replays through any session.
//
//   node packages/game-runtime/samples/ridgeline/tools/record_route.mjs MEDIA_DIR
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
let along = 0;
let phase = "roll";
let throttle = 0;

function pilot(jet, tick) {
  const p = [jet.transform.position.x, jet.transform.position.y, jet.transform.position.z];
  const v = [jet.velocity.x, jet.velocity.y, jet.velocity.z];
  const q = jet.transform.rotation;
  const F = rotate(q, [0, 0, -1]), U = rotate(q, [0, 1, 0]), R = rotate(q, [1, 0, 0]);
  const speed = len(v);
  const frame = { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } };
  const holdThrottle = (target) => { frame.axes.throttle = clamp((target - throttle) * 8, -1, 1); throttle = clamp(throttle + frame.axes.throttle * 0.55 / 60, 0, 1); };

  if (phase === "roll") {
    // Full afterburner down the centreline, nose wheel steering on the yaw axis.
    holdThrottle(1);
    frame.axes.yaw = clamp(-p[0] * 0.08 - F[0] * 3, -1, 1);
    if (speed > 72) frame.axes.pitch = clamp((0.2 - Math.asin(F[1])) * 4, -1, 1);
    if (p[1] > 80) { phase = "climb"; frame.justPressed.push("gear"); }
    return frame;
  }

  // Track the racing line: pure pursuit on a point a few seconds ahead.
  for (let k = along; k < Math.min(along + 40, line.length - 1); k += 1) {
    if (len(sub(line[k], p)) < len(sub(line[along], p))) along = k;
  }
  const lookahead = clamp(Math.round(speed * 1.6 / STEP), 4, 30);
  const target = line[Math.min(along + lookahead, line.length - 1)];
  const desired = norm(sub(target, p));
  // Wanted path acceleration turns the velocity toward the target; lift must also hold up the weight.
  const accel = mul(sub(mul(desired, speed), v), 1.1);
  const vhat = norm(v);
  const lift = add(accel, [0, 9.81, 0]);
  const liftPerp = sub(lift, mul(vhat, dot(lift, vhat)));
  const upWanted = norm(liftPerp);
  const bankError = Math.atan2(dot(cross(U, upWanted), F), dot(U, upWanted));
  frame.axes.roll = clamp(bankError * 1.2, -1, 1);
  const pathRate = dot(sub(accel, mul(vhat, dot(accel, vhat))), U) / Math.max(speed, 40);
  const rateLimit = Math.min(0.62, 8 * 9.81 / Math.max(speed, 40));
  frame.axes.pitch = clamp(pathRate / rateLimit * 1.4 * Math.max(0, Math.cos(bankError)), -1, 1);
  const canyon = along < line.length * 0.42;
  holdThrottle(speed < (canyon ? 150 : 185) ? 1 : 0.62);
  if (phase === "climb" && p[1] > 120) phase = "line";
  void tick;
  return frame;
}

const session = await createGameSession3D(document, 1, undefined, { resolveCollider });
const frames = [];
const gates = [];
const crashes = [];
let victory = -1;
try {
  for (let tick = 0; tick < 9000 && victory < 0; tick += 1) {
    const jet = session.inspect({ entityId: "jet" }).entities.find((entity) => entity.id === "jet");
    const frame = gameInputFrame3D.parse(tick < 30 ? { pressed: [] } : pilot(jet, tick));
    frames.push(frame);
    const result = session.step(frame);
    for (const event of result.events) {
      if (event.kind !== "trigger") continue;
      if (event.event === "gate") gates.push(result.tick);
      if (event.event === "crash") crashes.push(result.tick);
      if (event.event === "victory") victory = result.tick;
    }
    if (tick % 600 === 0) {
      const p = jet.transform.position;
      console.log(`tick ${tick} phase ${phase} along ${along}/${line.length} pos ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)} gates ${gates.length} crashes ${crashes.length}`);
    }
  }
  // A short hold after the finish lets the banner and the finish mix play out.
  for (let tick = 0; tick < 120 && victory >= 0; tick += 1) {
    const frame = gameInputFrame3D.parse(pilot(session.inspect({ entityId: "jet" }).entities.find((entity) => entity.id === "jet"), 0));
    frames.push(frame);
    session.step(frame);
  }
  const snapshot = session.snapshot();
  console.log(JSON.stringify({ ticks: frames.length, gates, crashes, victory, finish: snapshot.ui?.["finish-time"]?.text }));
  if (victory < 0 || crashes.length > 0) throw new Error("The autopilot did not complete the course cleanly");
} finally {
  session.dispose();
}
writeFileSync(path.join(SAMPLE, "completion.inputs.json"), `${JSON.stringify(frames)}\n`);
writeFileSync(path.join(SAMPLE, "completion.assertions.json"), `${JSON.stringify({ tolerance: 0.05, ticks: [{ tick: victory, events: [{ kind: "trigger", event: "victory", entityId: "jet" }] }] }, null, 2)}\n`);
