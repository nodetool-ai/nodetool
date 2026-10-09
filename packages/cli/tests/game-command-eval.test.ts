import { beforeAll, expect, it } from "vitest";
import { EVAL_SUITES } from "../src/commands/eval.js";

beforeAll(async () => { await import("@nodetool-ai/agents"); });

it("lists the native entity metadata case through the public eval registry", async () => {
  const suite = EVAL_SUITES.find(candidate=>candidate.id==="game-tools");
  if (!suite) { throw new Error("Native game eval suite must be registered"); }
  const cases = await suite.listCases();
  expect(cases.map(candidate=>candidate.id)).toEqual(["entity-tags-properties", "audio-mixer-buses", "procedural-sky", "script-parameters", "particle-emitter", "render-culling"]);
  expect(cases[0].description).toContain("nested JSON properties");
});
