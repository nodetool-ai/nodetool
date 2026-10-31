import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adaptKindle, prepareKindle, sha256 } from "./adapt.mjs";
import { kindleController } from "./bindings.mjs";
import { verifyKindleRun } from "./verify.mjs";

const raw = await readFile(new URL("../../../../../packages/game-runtime/samples/kindle/game.json", import.meta.url));
const source = JSON.parse(raw);
test("retains all source IDs, templates and the three unchanged script bodies", () => {
  const before = JSON.stringify(source), result = adaptKindle(source, []);
  assert.equal(JSON.stringify(source), before);
  assert.equal(result.provenance.originalScripts.length, 3);
  assert.equal(result.document.scenes.reduce((count, scene) => count + scene.entities.length, 0), 153);
  for (const scene of source.scenes) {
    const generated = result.document.scripts.find(script => script.id === `kindle-${scene.id}`).source;
    for (const entity of scene.entities) {
      assert.ok(result.document.scenes.find(s => s.id === scene.id).entities.some(e => e.id === entity.id) || entity.templateOnly);
      for (const behavior of entity.behaviors.filter(b => b.kind === "script")) {
        assert.ok(generated.includes(behavior.source));
        assert.ok(result.provenance.originalScripts.some(entry => entry.digest === sha256(behavior.source)));
      }
    }
  }
  assert.ok(result.provenance.omissions.some(entry => entry.component === "scene.ui"));
  assert.ok(result.provenance.omissions.some(entry => entry.component === "particles"));
});

const config = { cells: ["ember0"], actors: [], roles: [], patrols: [], solids: [], audio: [], templates: {}, musicVolume: .5 };
const input = (a, b) => ({ state: null, tick: 1, input: {}, events: [], lifecycle: { contacts: [{ a, b, phase: "enter" }] }, world: { get: id => ({ id, transform: { x: 2, y: 3 } }) } });
test("only actual hero contacts collect and score each cell once", () => {
  const negative = kindleController(input("crawler0", "ember0"), {}, config);
  assert.ok(!negative.commands.some(c => c.kind === "score" || c.kind === "despawn"));
  const positive = kindleController(input("hero", "ember0"), {}, config);
  assert.equal(positive.commands.filter(c => c.kind === "score").length, 1);
  assert.ok(positive.commands.some(c => c.kind === "despawn" && c.entityId === "ember0"));
  const repeated = kindleController({ ...input("hero", "ember0"), state: positive.state }, {}, config);
  assert.ok(!repeated.commands.some(c => c.kind === "score"));
  const exited = kindleController({ ...input("hero", "ember0"), lifecycle: { contacts: [{ a: "hero", b: "ember0", phase: "exit" }] } }, {}, config);
  assert.ok(!exited.commands.some(c => c.kind === "score"));
});
test("unmapped guest commands and source behaviors fail explicitly", () => {
  assert.throws(() => kindleController(input("hero", "floor"), { hero: () => ({ commands: [{ kind: "unknown" }] }) }, { ...config, roles: ["hero"] }), /Unsupported Kindle command/);
  const changed = structuredClone(source); changed.scenes[0].entities[0].behaviors.push({ kind: "unknown" });
  assert.throws(() => adaptKindle(changed, []), /Unmapped behavior/);
});
test("asset digest mismatch is rejected before a document is produced", async () => {
  const root = await mkdtemp(join(tmpdir(), "kindle-invalid-")), out = join(root, "out");
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "game.json"), JSON.stringify({ ...source, assets: { image: { assetId: "asset", digest: "0".repeat(64), mediaKind: "image" } } }));
  await writeFile(join(root, "assets", "asset.png"), "deliberately incorrect bytes");
  await assert.rejects(prepareKindle(root, out), /Digest mismatch/);
});

test("native command bindings retain role ownership, states and actual spawn templates", () => {
  const original = ({ state }) => ({ state: { visits: (state?.visits ?? 0) + 1 }, commands: [
    { kind: "setVelocity", x: 8, y: 17.5 }, { kind: "setVisual", opacity: .35, flipX: true },
    { kind: "playAnimation", clip: "jump" }, { kind: "spawn", prefabId: "dust", x: 4, y: 2 },
    { kind: "emit", event: "jump" }, { kind: "sceneTransition", sceneId: "title" }
  ] });
  const options = { ...config, cells: [], actors: ["hero"], roles: ["hero"], templates: { dust: { id: "dust", transform: { x: 0, y: 0 }, body2d: { type: "kinematic", velocity: { x: 0, y: 0 }, gravityScale: 0 }, gameplay: { lifetimeTicks: 50 } } } };
  const result = kindleController(input("hero", "stone"), { hero: original }, options);
  assert.deepEqual(result.commands.find(c => c.kind === "move"), { kind: "move", entityId: "hero", direction: { x: 8, y: 17.5 } });
  assert.deepEqual(result.commands.find(c => c.kind === "setVisual").visual, { opacity: .35, flipX: true });
  assert.equal(result.commands.find(c => c.kind === "spawn").entity.transform.x, 4);
  assert.equal(result.commands.find(c => c.kind === "spawn").entity.gameplay.lifetimeTicks, 50);
  assert.equal(result.commands.find(c => c.kind === "transition").sceneId, "title");
  const next = kindleController({ ...input("hero", "stone"), state: result.state }, { hero: original }, options);
  assert.equal(next.state.roles.hero.visits, 2);
  assert.deepEqual(next.commands.find(c => c.kind === "move" && c.entityId.startsWith("dust-")).direction, { x: 0, y: 0 });
  assert.notEqual(result.commands.find(c => c.kind === "spawn").entity.id, next.commands.find(c => c.kind === "spawn").entity.id);
});

test("patrol retains authored bounds, wall reversal and a native velocity target", () => {
  const options = { ...config, cells: [], actors: ["crawler0"], patrols: [{ id: "crawler0", axis: "x", origin: 0, distance: 2, speed: 1.7, falls: true }] };
  const result = kindleController(input("hero", "stone"), {}, options);
  assert.deepEqual(result.commands.find(c => c.kind === "move"), { kind: "move", entityId: "crawler0", direction: { x: -1.7, y: 0 } });
});

test("route verifier rejects an incomplete or fabricated win report", () => {
  const report = { validation: { valid: true }, ticks: 3535, replayTicks: 1768, final: { sceneId: "temple", score: 46, hero: { x: 229 } }, victory: [{ tick: 3334 }], checkpoints: [22, 484, 1500, 2400].map(tick => ({ tick })) };
  const observations = Array.from({ length: 3536 }, () => ({ events: [] }));
  assert.equal(verifyKindleRun(report, observations).valid, true);
  assert.throws(() => verifyKindleRun({ ...report, victory: [] }, observations), /victory/);
  assert.throws(() => verifyKindleRun({ ...report, final: { ...report.final, score: 0 } }, observations), /collect/);
  assert.throws(() => verifyKindleRun({ ...report, replayTicks: 0 }, observations));
});
