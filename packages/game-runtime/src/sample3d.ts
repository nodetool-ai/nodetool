import { gameDocument3D, type GameDocument3D } from "@nodetool-ai/protocol";

/** Asset-free acceptance level with explicit checkpoint and door scripts. */
export function createNative3DGame(id: string): GameDocument3D {
  const platform = (id: string, x: number, y: number, z: number, width: number, height: number, depth: number, color = "#63728d"): unknown => ({
    id, name: id, transform3d: { position: { x, y, z } }, body3d: { type: "static" },
    collider3d: { kind: "box", halfExtents: { x: width / 2, y: height / 2, z: depth / 2 } },
    primitive: { kind: "box", dimensions: { x: width, y: height, z: depth }, material: { color } }
  });
  return gameDocument3D.parse({
    schemaVersion: 3, engineVersion: "2", dimension: "3d", id, revision: "native-3d-exploration-v1", entrySceneId: "level",
    tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 }, inputActions: ["jump", "respawn"], inputAxes: ["moveX", "moveZ"], assets: {}, prefabs: {},
    scenes: [{
      id: "level", name: "Capsule exploration", activeCameraId: "camera",
      environment: { background: "#17243a", ambient: { color: "#d5e7ff", intensity: 0.7 } },
      entities: [
        { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective", fov: 60 }, behavior: { kind: "follow", targetId: "player", offset: { x: 0, y: 3, z: 6 } } } },
        { id: "sun", transform3d: { rotation: [Math.sin(-0.5), 0, 0, Math.cos(-0.5)] }, light3d: { kind: "directional", color: "#fff1d5", intensity: 2, castShadow: true } },
        { id: "player", name: "Player", transform3d: { position: { x: 0, y: 1, z: 3 } },
          body3d: { type: "kinematic" }, collider3d: { kind: "capsule", radius: 0.3, halfHeight: 0.5 }, character3d: {},
          interactionActor: { collects: true, activatesTriggers: true }, behaviors: [
            { kind: "winWhenCollected", count: 2 },
            { kind: "script", maxTickMs: 50, source: `(input) => {
              const state = input.state || { checkpoint: { x: 0, y: 1, z: 3 } };
              if (input.events.some(event => event.kind === "trigger" && event.event === "checkpoint")) {
                state.checkpoint = { x: 0, y: 1, z: -7 };
              }
              const commands = [];
              if (input.entity.position.y < -8 || input.justPressed.includes("respawn")) commands.push({ kind: "teleport", position: state.checkpoint });
              commands.push({ kind: "hud", id: "help", text: "WASD move · Space jump · R respawn · Drag to look", x: 16, y: 510 });
              return { state, commands };
            }` }
          ] },
        { id: "player-visual", parentId: "player", transform3d: {}, primitive: { kind: "capsule", dimensions: { x: 0.6, y: 1.6, z: 0.6 }, material: { color: "#47dfb5" } } },
        platform("floor", 0, -0.5, -3, 14, 1, 22),
        platform("step-1", -3, 0.1, -2, 2, 0.2, 1), platform("step-2", -3, 0.25, -3, 2, 0.5, 1),
        { id: "ramp", transform3d: { position: { x: 3, y: 0.7, z: -3 }, rotation: [Math.sin(-0.2), 0, 0, Math.cos(-0.2)] },
          body3d: { type: "static" }, collider3d: { kind: "box", halfExtents: { x: 1.1, y: 0.15, z: 2 } },
          primitive: { kind: "box", dimensions: { x: 2.2, y: 0.3, z: 4 }, material: { color: "#8d77ad" } } },
        { id: "moving-platform", transform3d: { position: { x: -3, y: 0.7, z: -6 } }, body3d: { type: "kinematic" },
          collider3d: { kind: "box", halfExtents: { x: 1, y: 0.15, z: 1 } }, primitive: { kind: "box", dimensions: { x: 2, y: 0.3, z: 2 }, material: { color: "#efbd58" } },
          behaviors: [{ kind: "script", maxTickMs: 50, source: `(input) => ({ state: null, commands: [{ kind: "setKinematicPose", position: { x: -3 + Math.sin((input.tick + 1) / 60) * 1.5, y: 0.7, z: -6 } }] })` }] },
        { id: "crate", transform3d: { position: { x: 1.5, y: 0.5, z: 0 } }, body3d: { type: "dynamic", mass: 8, ccd: true },
          collider3d: { kind: "box", halfExtents: { x: 0.4, y: 0.4, z: 0.4 } }, primitive: { kind: "box", dimensions: { x: 0.8, y: 0.8, z: 0.8 }, material: { color: "#b77b46" } } },
        { id: "pickup", transform3d: { position: { x: 0, y: 0.8, z: -2 } }, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 0.55, sensor: true },
          primitive: { kind: "sphere", dimensions: { x: 0.55, y: 0.55, z: 0.55 }, material: { color: "#ffcc47", emissive: "#8e5200" } }, behaviors: [{ kind: "collectible", score: 1 }] },
        { id: "door-switch", transform3d: { position: { x: 0, y: 0.8, z: -4 } }, body3d: { type: "static" }, collider3d: { kind: "box", halfExtents: { x: 0.8, y: 1, z: 0.4 }, sensor: true },
          primitive: { kind: "box", dimensions: { x: 1.6, y: 0.1, z: 0.8 }, material: { color: "#59aaff" } }, behaviors: [{ kind: "trigger", event: "open-door" }] },
        { id: "door", transform3d: { position: { x: 0, y: 1.3, z: -5.5 } }, body3d: { type: "kinematic" }, collider3d: { kind: "box", halfExtents: { x: 1.5, y: 1.3, z: 0.2 } },
          primitive: { kind: "box", dimensions: { x: 3, y: 2.6, z: 0.4 }, material: { color: "#477acd" } }, behaviors: [{ kind: "script", maxTickMs: 50, source: `(input) => {
            const state = input.state || { open: false };
            if (input.events.some(event => event.kind === "trigger" && event.event === "open-door")) state.open = true;
            return { state, commands: state.open ? [{ kind: "setKinematicPose", position: { x: 0, y: 4.5, z: -5.5 } }] : [] };
          }` }] },
        { id: "checkpoint", transform3d: { position: { x: 0, y: 0.8, z: -7 } }, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 0.8, sensor: true },
          primitive: { kind: "box", dimensions: { x: 0.5, y: 1, z: 0.5 }, material: { color: "#5ce6c0" } }, behaviors: [{ kind: "trigger", event: "checkpoint" }] },
        { id: "goal", transform3d: { position: { x: 0, y: 0.8, z: -10 } }, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 0.7, sensor: true },
          primitive: { kind: "sphere", dimensions: { x: 0.8, y: 0.8, z: 0.8 }, material: { color: "#ffdf67", emissive: "#886800" } }, behaviors: [{ kind: "collectible", score: 1 }] }
      ]
    }]
  });
}
