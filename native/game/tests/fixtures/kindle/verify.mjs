import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function verifyKindleRun(report, observations) {
  assert.equal(report.validation.valid, true);
  assert.equal(report.ticks, 3535);
  assert.equal(report.replayTicks, 1768);
  assert.equal(observations.length, 3536);
  assert.equal(report.final.sceneId, "temple");
  assert.equal(report.final.score, 46, "The route must physically collect its46 reachable embers");
  assert.equal(report.victory.length, 1, "The original hero function must emit victory once");
  assert.equal(report.checkpoints.length, 4, "All four braziers must be physically reached");
  assert.ok(!observations.some(frame => frame.events.some(event => event.name === "hurt")), "Completion route must not die");
  assert.ok(report.victory[0].tick < report.ticks - 60);
  assert.ok(report.final.hero.x > 220);
  return { valid: true, score: report.final.score, checkpoints: report.checkpoints.map(frame => frame.tick), victoryTick: report.victory[0].tick, replayTicks: report.replayTicks };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) { throw new Error("Provide the prepared output directory"); }
  const root = resolve(process.argv[2]);
  const result = verifyKindleRun(JSON.parse(await readFile(resolve(root, "report.json"))), JSON.parse(await readFile(resolve(root, "observations.json"))));
  await writeFile(resolve(root, "assertions-report.json"), JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify(result));
}
