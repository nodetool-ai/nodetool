import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { COURSE, ROAD_HALF_WIDTH, RACER_COLORS } from "./course.mjs";
import { createGameplay, createKartRig } from "./gameplay.mjs";
import { GAME_VIEWPORT } from "./presentation.mjs";

const directory = fileURLToPath(new URL("../", import.meta.url));
const assetsDir = path.join(directory, "assets");
await mkdir(assetsDir, { recursive: true });
const blockout = process.argv.includes("--blockout");
const gameplay = await createGameplay();
let art;
let presentation;
if (blockout) {
  art = {
    assets: {},
    entities: COURSE.map((p, i) => {
      const next = COURSE[(i + 1) % COURSE.length];
      const yaw = Math.atan2(next[0] - p[0], next[2] - p[2]);
      return { id: `road-${i}`, transform3d: { position: { x: (p[0] + next[0]) / 2, y: p[1] - 0.12, z: (p[2] + next[2]) / 2 }, rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] }, primitive: { kind: "box", dimensions: { x: ROAD_HALF_WIDTH * 2, y: 0.2, z: Math.hypot(next[0] - p[0], next[2] - p[2]) + 0.3 }, material: { color: "#465260" }, castShadow: false } };
    }),
    environment: { background: "#8acbde", ambient: { color: "#ffffff", intensity: 1 }, shadows: { enabled: false, mapSize: 1024, extent: 70 } }
  };
  presentation = { assets: {}, entities: [], viewport: GAME_VIEWPORT };
} else {
  const { createArt } = await import("./art.mjs");
  const { createPresentation } = await import("./presentation.mjs");
  art = await createArt({ assetsDir });
  presentation = await createPresentation({ assetsDir });
}
const karts = RACER_COLORS.flatMap((color, i) => createKartRig(i,
  blockout ? { primitive: { kind: "box", dimensions: { x: 1.5, y: 0.8, z: 2.4 }, material: { color } } } : { model: { assetId: `kart-${i}` } }));
const document = gameDocument3D.parse({
  schemaVersion: 3, engineVersion: "2", dimension: "3d",
  id: "79c2a1f60709479b9ba6ff160efca185", revision: "sunrush-kart-2",
  entrySceneId: "coastline", tickRate: 60,
  presentation: presentation.viewport,
  inputActions: gameplay.inputActions, inputAxes: gameplay.inputAxes, inputBindings: gameplay.inputBindings,
  assets: { ...art.assets, ...presentation.assets }, prefabs: {},
  performance: { budgets: { tickMs: 4, frameMs: 16.6, drawCalls: 500, triangles: 3000000, particles: 1000, voices: 24 } },
  ...(presentation.ui ? { ui: presentation.ui } : {}),
  ...(presentation.audio ? { audio: presentation.audio } : {}),
  scenes: [{ id: "coastline", name: "Coastline Cup", activeCameraId: "camera", gravity: { x: 0, y: 0, z: 0 },
    environment: art.environment,
    ...(presentation.music ? { music: presentation.music } : {}),
    entities: [...art.entities, ...gameplay.entities, ...karts, ...presentation.entities]
  }]
});
const destination = path.join(directory, blockout ? "blockout.game.json" : "game.json");
await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote ${destination} with ${document.scenes[0].entities.length} entities and ${Object.keys(document.assets).length} assets.`);
