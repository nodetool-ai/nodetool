import { describe, expect, it } from "vitest";
import { gameEntity3D, gameInputFrame3D, type GameBehavior3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { openGameSession } from "../src/open-session.js";
import { blockout } from "./fixtures-game3d.js";

const input = gameInputFrame3D.parse({ pressed: [] });

async function open(document: GameDocument3D, snapshot?: Parameters<typeof openGameSession>[1]["snapshot"]) {
  const result = await openGameSession(document, { seed: 7, snapshot });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  if (result.opened.dimension !== "3d") throw new Error("Expected 3D session");
  return result.opened.session;
}

function spawnedTree(removal: "despawn" | "lifetime"): GameDocument3D {
  const document = blockout();
  const player = document.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player) throw new Error("Player fixture is missing");
  player.behaviors = [{ kind: "script", maxTickMs: 50, maxCommands: 64,
    source: `input=>({state:null,commands:input.tick===0?[{kind:'spawn',prefabId:'tree'}]:input.tick===2&&'${removal}'==='despawn'?[{kind:'despawn',entityId:'tree#1/branch'}]:[]})` }];
  const branchBehaviors: GameBehavior3D[] = [{ kind: "script", maxTickMs: 50, maxCommands: 64,
    source: `input=>({state:{calls:(input.state?.calls||0)+1},commands:[{kind:'emit',event:'branch-called'}]})` }];
  if (removal === "lifetime") branchBehaviors.push({ kind: "lifetime", ticks: 1, fade: false, endScale: 1 });
  const script = (event: string) => ({ kind: "script", maxTickMs: 50, maxCommands: 64,
    source: `input=>({state:{calls:(input.state?.calls||0)+1},commands:[{kind:'emit',event:'${event}'}]})` });
  document.prefabs.tree = { rootId: "root", externalAssets: [], externalScenes: [], entities: [
    gameEntity3D.parse({ id: "root", transform3d: { position: { x: 3, y: 1, z: 0 } } }),
    gameEntity3D.parse({ id: "branch", parentId: "root", transform3d: {}, behaviors: branchBehaviors }),
    gameEntity3D.parse({ id: "leaf", parentId: "branch", transform3d: {}, primitive: { kind: "sphere", dimensions: { x: 1, y: 1, z: 1 } }, behaviors: [script("leaf-called")] }),
    gameEntity3D.parse({ id: "sibling", parentId: "root", transform3d: {}, behaviors: [script("sibling-called")] })
  ] };
  for (let index = 0; index < 128; index += 1) {
    document.prefabs.tree.entities.push(gameEntity3D.parse({ id: `descendant-${index}`,
      parentId: index === 0 ? "leaf" : `descendant-${index - 1}`, transform3d: {} }));
  }
  return document;
}

describe("3D camera and subtree boundaries", () => {
  it("initializes authored camera degrees as radians and keeps zero-look and restore stable", async () => {
    const document = blockout();
    const behavior = document.scenes[0].entities.find((entity) => entity.id === "camera")?.camera3d?.behavior;
    if (behavior?.kind !== "follow") throw new Error("Follow-camera fixture is missing");
    behavior.yaw = 90;
    behavior.pitch = 30;
    const session = await open(document);
    try {
      const saved = session.snapshot();
      expect(saved.camera.yaw).toBeCloseTo(Math.PI / 2, 11);
      expect(saved.camera.pitch).toBeCloseTo(Math.PI / 6, 11);
      session.step(input);
      expect(session.snapshot().camera.yaw).toBe(saved.camera.yaw);
      expect(session.snapshot().camera.pitch).toBe(saved.camera.pitch);
      const restored = await open(document, saved);
      try { restored.step(input); expect(restored.snapshot()).toEqual(session.snapshot()); }
      finally { restored.dispose(); }
    } finally { session.dispose(); }
  });

  it.each(["despawn", "lifetime"] as const)("removes spawned descendants and script state after branch %s, including resume", async (removal) => {
    const document = spawnedTree(removal);
    const session = await open(document);
    try {
      session.step(input);
      session.step(input);
      const beforeRemoval = session.snapshot();
      expect(Object.keys(beforeRemoval.scriptState).some((key) => key.includes("tree#1/leaf"))).toBe(true);
      session.step(input);
      const removed = session.snapshot();
      expect(removed.entities.filter((entity) => entity.instanceId === "tree#1").map((entity) => entity.id)).toEqual(["tree#1/root", "tree#1/sibling"]);
      expect(session.frame().entities.some((entity) => entity.entityId === "tree#1/leaf")).toBe(false);
      expect(Object.keys(removed.scriptState).some((key) => key.includes("tree#1/branch") || key.includes("tree#1/leaf"))).toBe(false);
      const restoredBefore = await open(document, beforeRemoval);
      try { restoredBefore.step(input); expect(restoredBefore.snapshot()).toEqual(removed); }
      finally { restoredBefore.dispose(); }
      const restoredAfter = await open(document, removed);
      try {
        const next = session.step(input);
        const resumed = restoredAfter.step(input);
        expect(next.events.some((event) => event.kind === "trigger" && (event.event === "branch-called" || event.event === "leaf-called"))).toBe(false);
        expect(next.events.some((event) => event.kind === "trigger" && event.event === "sibling-called")).toBe(true);
        expect(resumed.events).toEqual(next.events);
        expect(resumed.frame).toEqual(next.frame);
        expect(Object.keys(next.scriptStats?.byEntity ?? {})).toEqual(["player", "tree#1/sibling"]);
        expect(restoredAfter.snapshot()).toEqual(session.snapshot());
      } finally { restoredAfter.dispose(); }
    } finally { session.dispose(); }
  });
});
