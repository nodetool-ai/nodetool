import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NativeGameWorker } from "@nodetool-ai/game-runtime/native";

if (!process.argv[2] || !process.argv[3]) { throw new Error("Provide output directory and installed game-worker"); }
const out = resolve(process.argv[2]), executable = resolve(process.argv[3]), document = JSON.parse(await readFile(resolve(out, "game.json")));
const worker = new NativeGameWorker({ executable }), options = { signal: AbortSignal.timeout(120000) }, report = {};
const hero = frame => frame.entities.find(entity => entity.id === "hero");
const open = async (sessionId, copy) => {
  copy.initialSceneId = "temple";
  await worker.request("open", { sessionId, document: copy }, options);
  return worker.request("start", { sessionId, seed: 1 }, options);
};
const step = async (sessionId, actions = {}) => {
  const frame = await worker.request("step", { sessionId, input: { actions, move: { x: Number(Boolean(actions.right)) - Number(Boolean(actions.left)), y: 0 }, jump: Boolean(actions.space || actions.up) } }, options);
  assert.equal(frame.logs.length, 0); return frame;
};
try {
  await open("jump", structuredClone(document));
  let frame;
  for (let index = 0; index < 10; index++) { frame = await step("jump"); }
  const start = hero(frame).transform, cameraStart = frame.camera;
  const patrolCrawler = frame.entities.find(entity => entity.id === "crawler0").transform;
  const lift = frame.entities.find(entity => entity.id === "lift0").transform;
  assert.ok(patrolCrawler.x > 24.6, "Zero keyboard move must not suppress crawler patrol");
  assert.ok(lift.x > 71.2, "Static platform velocity must remain active");
  let peak = start.y;
  for (let index = 0; index < 24; index++) { frame = await step("jump", { up: true, right: true }); peak = Math.max(peak, hero(frame).transform.y); }
  assert.ok(peak > start.y + 2, "Up must invoke the original jump");
  assert.ok(hero(frame).transform.x > start.x + 1, "Right must physically move the hero");
  assert.notDeepEqual(frame.camera, cameraStart, "Original following camera must move");
  const dust = frame.entities.find(entity => entity.id.startsWith("dust-"));
  assert.ok(dust); assert.equal(dust.transform.x, start.x, "Keyboard movement must not drag spawned dust");
  report.jumpAndCamera = { start, final: hero(frame).transform, peak, camera: frame.camera, crawler: patrolCrawler, lift, dust: dust.transform };

  const negative = structuredClone(document), entities = negative.scenes.find(scene => scene.id === "temple").entities;
  const cell = entities.find(entity => entity.id === "ember0"), crawler = entities.find(entity => entity.id === "crawler0");
  crawler.transform.x = cell.transform.x; crawler.transform.y = cell.transform.y; crawler.body2d.gravityScale = 0;
  crawler.collider2d.mask |= 8; cell.collider2d.mask |= 4;
  await open("non-player", negative);
  let contact = false;
  for (let index = 0; index < 8; index++) {
    frame = await step("non-player");
    contact ||= frame.events.some(event => [event.a, event.b].includes("ember0") && [event.a, event.b].includes("crawler0"));
    assert.equal(frame.score, 0); assert.ok(frame.entities.some(entity => entity.id === "ember0"));
  }
  assert.ok(contact, "The negative must contain a real broadened-mask crawler/cell contact");
  report.nonPlayer = { actualContact: contact, score: frame.score, cellRetained: true };

  const water = structuredClone(document), waterHero = water.scenes.find(scene => scene.id === "temple").entities.find(entity => entity.id === "hero");
  waterHero.transform.x = 30; waterHero.transform.y = 1;
  await open("water", water);
  let hurts = 0, splashes = 0;
  for (let index = 0; index < 90; index++) {
    frame = await step("water"); hurts += frame.events.filter(event => event.name === "hurt").length; splashes += frame.events.filter(event => event.name === "splash").length;
  }
  const snapshot = await worker.request("snapshot", { sessionId: "water" }, options), state = snapshot.states["hero/controller"].roles.hero;
  assert.ok(hurts >= 1 && splashes >= 1); assert.equal(state.deaths, hurts);
  assert.deepEqual(state.spawn, { x: 30, y: 1 });
  report.waterDeathRespawn = { hurts, splashes, deaths: state.deaths, deadCountdown: state.dead, spawn: state.spawn, hero: hero(frame).transform };
  await writeFile(resolve(out, "probes-report.json"), JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report));
} finally { worker.close(); }
