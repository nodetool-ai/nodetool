import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NativeGameWorker } from "@nodetool-ai/game-runtime/native";

if (!process.argv[2] || !process.argv[3]) { throw new Error("Provide output directory and installed worker"); }
const out = resolve(process.argv[2]), executable = resolve(process.argv[3]), document = JSON.parse(await readFile(resolve(out, "game.json")));
const worker = new NativeGameWorker({ executable }), sessionId = "sunrush-controls", options = { signal: AbortSignal.timeout(120000) }, report = {};
const step = async (actions = {}, axes) => {
  const frame = await worker.request("step", { sessionId, input: { actions, ...(axes ? { axes } : {}), move: [Number(Boolean(actions.steerRight)) - Number(Boolean(actions.steerLeft)), 0, -Number(Boolean(actions.accelerate))], jump: false } }, options);
  assert.equal(frame.logs.length, 0); return frame;
};
const state = async () => (await worker.request("snapshot", { sessionId }, options)).states["presentation/controller"];
try {
  await worker.request("open", { sessionId, document }, options); await worker.request("start", { sessionId, seed: 1 }, options);
  let frame;
  for (let index = 0; index < 20; index++) { frame = await step({ accelerate: true }); }
  let current = await state(); const player = current.roles["racer-0"];
  assert.equal(player.phase, "title"); assert.equal(player.lap, 0); assert.equal(player.gate, 1); assert.equal(player.time, 0);
  report.noStart = { phase: player.phase, lap: player.lap, gate: player.gate, time: player.time };
  await step({ start: true }); for (let index = 0; index < 10; index++) { await step(); }
  const beforePause = (await state()).roles["racer-0"];
  await step({ pause: true }); for (let index = 0; index < 20; index++) { await step({ accelerate: true }); }
  const paused = (await state()).roles["racer-0"];
  assert.equal(paused.phase, "paused"); assert.equal(paused.countdown, beforePause.countdown); assert.equal(paused.progress, beforePause.progress);
  await step({ pause: true }); current = await state(); assert.equal(current.roles["racer-0"].phase, "countdown");
  report.pause = { before: beforePause.countdown, paused: paused.countdown, resumed: current.roles["racer-0"].countdown };
  for (let index = 0; index < 180 && (await state()).roles["racer-0"].phase !== "racing"; index++) { await step(); }
  assert.equal((await state()).roles["racer-0"].phase, "racing");
  frame = await step(); const forwardCamera = frame.camera;
  const snapshot = await worker.request("snapshot", { sessionId }, options);
  frame = await step({ lookBack: true });
  const racer = frame.entities.find(entity => entity.id === "racer-0").transform.position;
  const forward = forwardCamera.position.map((value, index) => value - racer[index]), back = frame.camera.position.map((value, index) => value - racer[index]);
  assert.ok(forward[0] * back[0] + forward[2] * back[2] < 0, "Look-back must resolve the camera to the other side of the native racer");
  const forwardAim = forwardCamera.target.map((value, index) => value - forwardCamera.position[index]), backAim = frame.camera.target.map((value, index) => value - frame.camera.position[index]);
  assert.ok(forwardAim[0] * backAim[0] + forwardAim[2] * backAim[2] < 0, "The active native camera must inherit the helper quaternion, not merely its position");
  report.lookBack = { forwardCamera, backCamera: frame.camera };
  await worker.request("restore", { sessionId, snapshot }, options);
  for (let index = 0; index < 90; index++) { await step({ accelerate: true }); }
  const beforeRecover = (await state()).roles["racer-0"];
  assert.ok(beforeRecover.speed > 10);
  frame = await step({ recover: true }); const recovered = (await state()).roles["racer-0"];
  assert.equal(recovered.speed, 0); assert.equal(recovered.stun, 30); assert.equal(recovered.lap, beforeRecover.lap);
  assert.equal(recovered.gate, beforeRecover.gate); assert.ok(frame.events.some(event => event.name === "hit"));
  report.recover = { beforeSpeed: beforeRecover.speed, speed: recovered.speed, stun: recovered.stun, lap: recovered.lap, gate: recovered.gate };
  await writeFile(resolve(out, "probes-report.json"), JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report));
} finally { worker.close(); }
