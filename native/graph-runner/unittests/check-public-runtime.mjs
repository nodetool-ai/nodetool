import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const [runner,bundle] = process.argv.slice(2);
const graphs = fileURLToPath(new URL("../tests/g6/graphs/",import.meta.url));
const coreGraphs = fileURLToPath(new URL("../tests/graphs/",import.meta.url));
let checks=0;
function run(name, expected, event="", cancel=false) {
  const graph=existsSync(`${graphs}${name}.json`) ? `${graphs}${name}.json` : `${coreGraphs}${name}.json`;
  const result=spawnSync(runner,[bundle,graph,event,...(cancel?["cancel"]:[])],{encoding:"utf8",timeout:90000});
  const messages=result.stdout.split("\n").filter((line)=>line.startsWith("{")).map(JSON.parse);
  assert.ok(messages.length,`${name}: no messages: ${result.stderr}`);
  const terminal=messages.filter((m)=>m.type==="job_update" && ["completed","failed","cancelled"].includes(m.status) && !m.result);
  assert.equal(terminal.length,1,`${name}: exactly one terminal`);
  assert.equal(terminal[0].status,expected,`${name}: ${result.stderr}`);
  assert.equal(messages.at(-1).status,expected);
  if(cancel) {
    const indices=messages.filter((m)=>m.type==="output_update"&&m.output_name==="index").map((m)=>m.value);
    assert.deepEqual(indices,[0,1,2,3,4],`${name}: no iterations after cancellation`);
  }
  ++checks;
  console.log(`PASS ${name}: ${expected}`);
  return messages;
}
const trigger=run("trigger-manual","completed",JSON.stringify({node_id:"trigger",payload:{data:{value:23},timestamp:"2026-01-02T03:04:05.000Z",source:"fixture"}}));
assert.deepEqual(trigger.at(-1).result.outputs,{result:[{value:23}]});
assert.deepEqual(run("subgraph-inline","completed").at(-1).result.outputs,{result:[17]});
assert.deepEqual(run("subgraph-channel-isolation","completed").at(-1).result.outputs,{Left:["left-only"],Right:["right-only"]});
assert.deepEqual(run("dynamic-input-list","completed").at(-1).result.outputs,{result:[[3]]});
run("subgraph-depth-8","completed");
const deep=run("subgraph-depth-9","failed");
assert.match(deep.find((m)=>m.type==="job_update"&&m.error).error,/nested more than 8 levels deep/);
run("loop-limit","cancelled","",true);
run("subgraph-cancel","cancelled","",true);
run("trigger-manual","failed","{");
run("trigger-manual","failed",JSON.stringify({node_id:0,payload:{}}));
assert.equal(checks,10);
console.log(`${checks} public runtime cases passed`);
