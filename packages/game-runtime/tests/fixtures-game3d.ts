import { gameDocument3D } from "@nodetool-ai/protocol";

export function blockout() {
  return gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "three", revision: "draft", entrySceneId: "scene",
    tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 }, inputActions: ["jump"], assets: {},
    scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" }, behavior: { kind: "follow", targetId: "player" } } },
      { id: "player", transform3d: {}, body3d: { type: "kinematic" }, collider3d: { kind: "capsule", radius: 0.4, halfHeight: 0.5 },
        character3d: {}, interactionActor: { collects: true, activatesTriggers: true } }
    ] }] });
}
