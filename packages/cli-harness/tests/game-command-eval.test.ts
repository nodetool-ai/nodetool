import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("lists the native entity metadata case through the public eval registry", async () => {
  // Node loads the built registry and its native provider dependencies as the shipped CLI does.
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
    import { EVAL_SUITES } from ${JSON.stringify(new URL("../dist/commands/eval.js", import.meta.url).href)};
    const suite = EVAL_SUITES.find(candidate => candidate.id === "game-tools");
    if (!suite) { throw new Error("Native game eval suite must be registered"); }
    console.log(JSON.stringify(await suite.listCases()));
  `], { encoding: "utf8", timeout: 30000 });
  const cases: { id: string; description: string }[] = JSON.parse(output);
  expect(cases.map(candidate=>candidate.id)).toEqual(["entity-tags-properties", "audio-mixer-buses", "procedural-sky", "script-parameters", "particle-emitter", "render-culling", "input-bindings", "spatial-audio-source", "particle-rendering", "lifecycle-timer-script", "post-processing", "cascaded-shadows", "hud-widget-tree", "collision-layer-matrix", "typed-event-script", "physics-materials", "hud-widget-tree-3d", "player-saves-script", "particle-rendering-3d", "streaming-music", "streaming-music-3d", "script-hot-reload", "script-hot-reload-3d", "forces-and-torques-3d", "material-system-3d", "environment-preset-3d", "particle-preset-2d", "particle-preset-3d", "height-fog-and-decals-3d"]);
  expect(cases[0].description).toContain("nested JSON properties");
});
