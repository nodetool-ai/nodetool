import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function verifySunrushRun(report, observations) {
  assert.equal(report.valid, true); assert.equal(report.ticks, 3717); assert.equal(report.replayTicks, 1859);
  assert.equal(observations.length, 3718);
  const player = report.controller.roles["racer-0"], events = observations.flatMap(frame => frame.events);
  const laps = events.filter(event => event.name === "lap");
  assert.equal(player.phase, "finished"); assert.equal(player.finished, true);
  assert.equal(player.lap, 3); assert.equal(player.gate, 13); assert.equal(player.finalPosition, 1);
  assert.equal(player.results.length, 6); assert.ok(player.finishTime > 30);
  assert.deepEqual(laps.map(event => event.data.payload.lap), [1, 2, 3]);
  assert.ok(laps.every(event => event.data.sourceEntityId === "racer-0"));
  assert.equal(events.filter(event => event.name === "finish").length, 1);
  assert.equal(events.filter(event => event.name === "win").length, 1);
  for (const name of ["drift", "boost", "pickup", "item"]) { assert.ok(events.some(event => event.name === name), `Recorded route must exercise ${name}`); }
  assert.equal(report.ui.results.visible, true);
  assert.equal(report.ui["results-title"].text, "COASTLINE CHAMPION");
  return { valid: true, ticks: report.ticks, replayTicks: report.replayTicks, laps: [1, 2, 3], position: player.finalPosition, finishTime: player.finishTime,
    finishTick: observations.find(frame => frame.events.some(event => event.name === "finish")).tick };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) { throw new Error("Provide the prepared output directory"); }
  const out = resolve(process.argv[2]);
  const result = verifySunrushRun(JSON.parse(await readFile(resolve(out, "report.json"))), JSON.parse(await readFile(resolve(out, "observations.json"))));
  await writeFile(resolve(out, "assertions-report.json"), JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify(result));
}
