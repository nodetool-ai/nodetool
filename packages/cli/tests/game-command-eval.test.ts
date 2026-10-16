import { beforeAll, expect, it } from "vitest";
import { EVAL_SUITES } from "../src/commands/eval.js";

beforeAll(async () => { await import("@nodetool-ai/agents"); });

it("lists the native entity metadata case through the public eval registry", async () => {
  const suite = EVAL_SUITES.find(candidate=>candidate.id==="game-tools");
  if (!suite) { throw new Error("Native game eval suite must be registered"); }
  const cases = await suite.listCases();
  expect(cases.map(candidate=>candidate.id)).toEqual(["entity-tags-properties", "audio-mixer-buses", "procedural-sky", "script-parameters", "particle-emitter", "render-culling", "input-bindings", "spatial-audio-source", "particle-rendering", "lifecycle-timer-script", "post-processing", "cascaded-shadows", "hud-widget-tree", "collision-layer-matrix", "typed-event-script", "physics-materials", "hud-widget-tree-3d", "player-saves-script", "particle-rendering-3d", "streaming-music", "streaming-music-3d", "script-hot-reload", "script-hot-reload-3d", "forces-and-torques-3d", "material-system-3d", "environment-preset-3d", "height-fog-and-decals-3d"]);
  expect(cases[0].description).toContain("nested JSON properties");
});
