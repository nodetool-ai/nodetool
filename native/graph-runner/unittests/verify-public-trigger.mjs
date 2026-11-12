import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { diffStreams, finalStatus, parseStream, toStreams } from "../tools/conformance.mjs";

const [driver, bundle] = process.argv.slice(2);
assert.ok(driver && bundle, "expected public runner and guest bundle");
const graph = fileURLToPath(new URL("../tests/g6/graphs/trigger-manual.json", import.meta.url));
const event = JSON.stringify({ node_id: "trigger", payload: { data: { value: 23 }, timestamp: "2026-01-02T03:04:05.000Z", source: "fixture" } });
function run(command, args, timeout = 30000) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  const parsed = parseStream(result.stdout);
  assert.deepEqual(parsed.problems, []);
  assert.ok(parsed.messages.length > 0, "runner returned no messages");
  assert.equal(finalStatus(parsed.messages), "completed");
  assert.equal(parsed.messages.filter(message => message.type === "job_update" &&
    message.status === "completed" && !message.result).length, 1);
  return parsed.messages;
}
const reference = run(process.execPath, [fileURLToPath(new URL("./trigger-reference.mjs", import.meta.url)), graph, event]);
const actual = run(driver, [bundle, graph, event], 90000);
assert.deepEqual(diffStreams(toStreams(reference), toStreams(actual)), []);
console.log("Public trigger submission matches the production runner message streams");
