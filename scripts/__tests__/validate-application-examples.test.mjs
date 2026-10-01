import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { expandBundle } from "../validate-examples.mjs";

const bundle = () => ({schemaVersion: 1, name: "Script app", workflows: [], scripts: [{key: "plan", name: "Plan", version: 1, document: {schemaVersion: 1, code: "await output('result', inputs.price);", inputs: [{name: "price", type: "str"}], outputs: [{name: "result", type: "str"}], packages: [], secrets: [], tests: [], timeoutSeconds: 60}}], app: {schemaVersion: 4, ui: {root: {}, content: []}, variables: [], resources: [], operations: [{id: "plan", name: "Plan", workflowId: "", target: {kind: "script", scriptId: "plan", scriptVersion: 1}, inputs: {price: {from: "widget"}}, outputs: {result: {to: "display"}}, policy: "replace"}]}});
const validate = value => {
  const directory = mkdtempSync(join(tmpdir(), "application-example-test-"));
  try {const file = join(directory, "example.app.json"); writeFileSync(file, JSON.stringify(value)); return expandBundle(file);}
  finally {rmSync(directory, {recursive: true, force: true});}
};
test("valid script-only bundle passes executable example validation", () => {assert.equal(validate(bundle()).parseError, null);});
test("empty executable bundle fails", () => {const value = bundle(); value.scripts = []; value.app.operations = []; assert.match(validate(value).parseError, /no workflows or scripts/);});
test("missing script target fails", () => {const value = bundle(); value.app.operations[0].target.scriptId = "missing"; assert.match(validate(value).parseError, /missing bundled script/);});
test("missing script pin fails", () => {const value = bundle(); value.app.operations[0].target.scriptVersion = 99; assert.match(validate(value).parseError, /script version/);});
test("invalid script input mapping fails", () => {const value = bundle(); value.app.operations[0].inputs = {missing: {from: "widget"}}; assert.match(validate(value).parseError, /missing script input/);});
test("invalid JS document fails", () => {const value = bundle(); value.scripts[0].document.schemaVersion = 99; assert.match(validate(value).parseError, /Script plan/);});
test("workflow graphs remain queued for the existing graph validator", () => {const value = bundle(); value.workflows = [{key: "workflow", name: "Workflow", graph: {nodes: [], edges: []}}]; const result = validate(value); assert.equal(result.parseError, null); assert.equal(result.workflows.length, 1); assert.deepEqual(result.workflows[0].graph, value.workflows[0].graph);});
