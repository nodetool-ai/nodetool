// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function sandboxShell(inputs) {
  return createNode("nodetool.sandbox.SandboxShell", inputs, { outputNames: ["output", "running", "exit_code", "timed_out"] });
}
function sandboxFile(inputs) {
  return createNode("nodetool.sandbox.SandboxFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  sandboxFile,
  sandboxShell
};
