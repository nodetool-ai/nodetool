import { describe, expect, it } from "vitest";
import { gameDocument, gameDocument3D, gameInputFrame3D, type GameDocument, type GameDocument3D } from "@nodetool-ai/protocol";

import {
  applyGameOps,
  applyGameOps3D,
  createGameSession3D,
  createScriptedGameSession,
  createTopDownRoomGame,
  validateGame,
  validateGame3D
} from "../src/index.js";
import { blockout } from "./fixtures-game3d.js";

const particles = {
  emitters: [
    { id: "flame", rate: 30, lifetime: { min: 0.5, max: 1 }, onDeath: [{ emitter: "spark", count: 2 }] },
    { id: "spark", playOnStart: false, rate: 0 }
  ]
};
const emitScript = "({tick}) => ({ state: null, commands: tick % 2 === 0 ? [{ kind: 'emitParticles', emitter: 'spark', count: 3 }] : [] })";

function document2D(withParticles: boolean): GameDocument {
  const base = createTopDownRoomGame("particles");
  return gameDocument.parse({
    ...base,
    schemaVersion: 2,
    scenes: base.scenes.map((scene, index) => index === 0 ? {
      ...scene,
      entities: [...scene.entities, {
        id: "torch", transform2d: { x: 1, y: 2 },
        ...(withParticles ? { particles } : {}),
        behaviors: [{ kind: "script", maxTickMs: 50, source: emitScript }]
      }]
    } : scene)
  });
}

function document3D(withParticles: boolean): GameDocument3D {
  const base = blockout();
  return gameDocument3D.parse({
    ...base,
    scenes: [{ ...base.scenes[0], entities: [...base.scenes[0].entities, {
      id: "torch", transform3d: { position: { x: 1, y: 2, z: 3 } },
      ...(withParticles ? { particles } : {}),
      behaviors: [{ kind: "script", maxTickMs: 50, source: emitScript }]
    }] }]
  });
}

function withoutDigest(snapshot: object): object {
  const { contentDigest: _contentDigest, ...rest } = snapshot as { contentDigest?: string };
  return rest;
}

describe("particles stay presentation state", () => {
  it("routes 2D emitParticles to the presentation channel and never into events or snapshots", async () => {
    const document = document2D(true);
    expect(validateGame(document).errors).toEqual([]);
    const session = await createScriptedGameSession(document, 4);
    const plain = await createScriptedGameSession(document2D(false), 4);
    try {
      expect(session.frame().particles).toEqual([{ entityId: "torch", x: 1, y: 2, rotation: 0, particles: document.scenes[0].entities.at(-1)?.particles }]);
      expect(plain.frame().particles).toBeUndefined();
      for (let tick = 0; tick < 6; tick += 1) {
        const step = session.step({ pressed: [], justPressed: [] });
        plain.step({ pressed: [], justPressed: [] });
        const presentation = session.takePresentationEvents();
        expect(step.events.some((event) => (event.kind as string) === "particles")).toBe(false);
        expect(presentation.filter((event) => event.kind === "particles")).toEqual(
          tick % 2 === 0 ? [{ kind: "particles", entityId: "torch", emitter: "spark", count: 3 }] : []
        );
        const snapshot = session.snapshot();
        expect(JSON.stringify(snapshot)).not.toMatch(/particles|emitParticles|spark/);
        expect(withoutDigest(snapshot)).toEqual(withoutDigest(plain.snapshot()));
      }
    } finally {
      session.dispose();
      plain.dispose();
    }
  });

  it("routes 3D emitParticles to the presentation channel and never into events or snapshots", async () => {
    const document = document3D(true);
    expect(validateGame3D(document).errors).toEqual([]);
    const input = gameInputFrame3D.parse({ pressed: [] });
    const session = await createGameSession3D(document, 4);
    const plain = await createGameSession3D(document3D(false), 4);
    try {
      expect(session.frame().entities.find((entity) => entity.entityId === "torch")?.particles).toEqual(document.scenes[0].entities.at(-1)?.particles);
      for (let tick = 0; tick < 6; tick += 1) {
        const step = session.step(input);
        plain.step(input);
        const presentation = session.takePresentationEvents();
        expect(step.events.some((event) => (event.kind as string) === "particles")).toBe(false);
        expect(presentation.filter((event) => event.kind === "particles")).toEqual(
          tick % 2 === 0 ? [{ kind: "particles", entityId: "torch", emitter: "spark", count: 3 }] : []
        );
        const snapshot = session.snapshot();
        expect(JSON.stringify(snapshot)).not.toMatch(/particles|emitParticles|spark/);
        expect(withoutDigest(snapshot)).toEqual(withoutDigest(plain.snapshot()));
      }
    } finally {
      session.dispose();
      plain.dispose();
    }
  });
});

describe("particles component authoring", () => {
  const broken = { emitters: [
    { id: "a", onDeath: [{ emitter: "missing" }], lifetime: { min: 2, max: 1 } },
    { id: "a", sizeOverLifetime: [{ t: 0.5, value: 1 }, { t: 0.2, value: 0 }] }
  ] };

  it("reports duplicate ids, missing death emitters, inverted ranges and unsorted curves", () => {
    const base = document2D(true);
    const invalid = { ...base, scenes: [{ ...base.scenes[0], entities: [...base.scenes[0].entities.slice(0, -1), { id: "torch", transform2d: { x: 0, y: 0 }, particles: broken }] }, ...base.scenes.slice(1)] };
    expect(validateGame(invalid).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("particles.emitters.1.id: Duplicate particle emitter a"),
      expect.stringContaining("particles.emitters.0.onDeath.0.emitter: Particle emitter missing does not exist"),
      expect.stringContaining("particles.emitters.0.lifetime: Range min must not exceed max"),
      expect.stringContaining("particles.emitters.1.sizeOverLifetime: Curve keys must be sorted by t")
    ]));
    const base3D = document3D(true);
    const invalid3D = { ...base3D, scenes: [{ ...base3D.scenes[0], entities: [...base3D.scenes[0].entities.slice(0, -1), { id: "torch", transform3d: {}, particles: broken }] }] };
    expect(validateGame3D(invalid3D).diagnostics.filter((issue) => issue.code === "invalid_particles")).toHaveLength(4);
  });

  it("checks particle sprite assets and sheet frame counts", () => {
    const sheet = (assetId: string, extra: object = {}) => ({ emitters: [{ id: "puff", sprite: { assetId, columns: 2, rows: 2, ...extra }, blend: "additive", unlit: true, layer: 3 }] });
    const withEmitter = (component: object): GameDocument => {
      const base = document2D(false);
      return { ...base, scenes: [{ ...base.scenes[0], entities: [...base.scenes[0].entities.slice(0, -1), { id: "torch", transform2d: { x: 0, y: 0 }, particles: component }] }, ...base.scenes.slice(1)] } as GameDocument;
    };
    expect(validateGame(withEmitter(sheet("gem"))).errors).toEqual([]);
    expect(validateGame(withEmitter(sheet("missing"))).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("particles.emitters.0.sprite.assetId: Particle sprite missing must be an image asset")
    ]));
    expect(validateGame(withEmitter(sheet("sfx.collect"))).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("particles.emitters.0.sprite.assetId: Particle sprite sfx.collect must be an image asset")
    ]));
    expect(validateGame(withEmitter(sheet("gem", { frameCount: 5 }))).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("particles.emitters.0.sprite.frameCount: frameCount must not exceed columns × rows (4)")
    ]));
    const base3D = document3D(false);
    const missing3D = { ...base3D, scenes: [{ ...base3D.scenes[0], entities: [...base3D.scenes[0].entities.slice(0, -1), { id: "torch", transform3d: {}, particles: sheet("missing") }] }] };
    expect(validateGame3D(missing3D).diagnostics.filter((issue) => issue.code === "missing_asset").map((issue) => issue.path.join("."))).toEqual(
      [expect.stringMatching(/particles\.emitters\.0\.sprite\.assetId$/)]
    );
  });

  it("sets render fields through document ops", () => {
    const component = { emitters: [{ id: "puff", sprite: { assetId: "gem", columns: 2 }, blend: "additive", unlit: true, layer: 3 }] };
    const updated = applyGameOps(document2D(false), [{ op: "update_entity", entity_id: "torch", set: { particles: component } }]);
    expect(updated.scenes[0].entities.at(-1)?.particles?.emitters[0]).toMatchObject({ sprite: { assetId: "gem", columns: 2, rows: 1, cycles: 1 }, blend: "additive", unlit: true, layer: 3 });
    expect(validateGame(updated).errors).toEqual([]);
  });

  it("requires 2D schema version 2", () => {
    expect(validateGame({ ...document2D(true), schemaVersion: 1 }).errors).toEqual(expect.arrayContaining([expect.stringContaining("particles: requires schema version 2")]));
  });

  it("sets and removes the component through document ops", () => {
    const set2D = applyGameOps(document2D(false), [{ op: "update_entity", entity_id: "torch", set: { particles } }]);
    expect(set2D.scenes[0].entities.at(-1)?.particles?.emitters.map((emitter) => emitter.id)).toEqual(["flame", "spark"]);
    const cleared2D = applyGameOps(set2D, [{ op: "update_entity", entity_id: "torch", set: { particles: null } }]);
    expect(cleared2D.scenes[0].entities.at(-1)?.particles).toBeUndefined();

    const set3D = applyGameOps3D(document3D(false), [{ op: "update_entity", entity_id: "torch", set: { particles } }]);
    expect(set3D.scenes[0].entities.at(-1)?.particles?.emitters).toHaveLength(2);
    const cleared3D = applyGameOps3D(set3D, [{ op: "update_entity", entity_id: "torch", set: { particles: null } }]);
    expect(cleared3D.scenes[0].entities.at(-1)?.particles).toBeUndefined();
  });
});
