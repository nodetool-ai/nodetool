/**
 * Copy for /agents, shared by the page and its Markdown mirror
 * (scripts/generate-llms-txt.mjs). Permission modes are checked against
 * decidePermission in packages/runtime/src/permission-gate.ts.
 */

export const AGENTS_LEAD =
  "A harness is everything an agent works inside: tools, editors, models, keys, and a record of each step. NodeTool gives one to the built-in agent, or to Claude Code, Codex, or Cursor over MCP. It checks each graph before a paid run, logs every call, and lets you stop the agent and take over.";

export const APPROVAL_MODES_INTRO =
  "Each chat has a permission mode. Reading and searching run in every mode. The mode decides what happens to the rest.";

export const LOOP_STAGES = [
  {
    title: "Build",
    tool: "create_workflow",
    body: "The agent adds nodes, picks models, and wires the graph. A graph naming a provider or model that does not exist is refused, not saved.",
  },
  {
    title: "Validate",
    tool: "validate_workflow",
    body: "A static check in well under a second, before any model is called.",
  },
  {
    title: "Run",
    tool: "run_workflow",
    body: "The graph calls your local models and provider accounts. A run whose provider has no key is refused before the first node starts.",
  },
  {
    title: "Inspect",
    tool: "get_job_logs",
    body: "Every tool call, output, and error is in the log, with the node that failed.",
  },
  {
    title: "Repair",
    tool: "create_workflow_version",
    body: "The fix is a new version. The last good one stays.",
  },
];

/**
 * What validate_workflow reports, from validateGraph in
 * @nodetool-ai/node-sdk (docs/harnesses.md § nodetool validate).
 */
export const VALIDATION_CHECKS = [
  "Unknown node types",
  "Required properties left empty, and models never selected",
  "A model id the chosen provider does not offer",
  "Edges that connect the wrong types, or lead nowhere",
  "Code nodes that do not parse, read an undefined name, or leave an output unset",
  "Provider keys this install cannot find",
];

export const VALIDATION_NOTE =
  "The same check guards the run endpoint. A graph that fails it never reaches the paid half, so the agent does not learn about a typo from a bill.";

/** Models and keys are on the page once, in its SpecStrip. */
export const CONTROLS = [
  {
    title: "A full record",
    body: "Read each tool call with its arguments, result, and error. Find the step that went wrong.",
  },
  {
    title: "Your hands",
    body: "Stop the agent, change a node yourself, and hand the work back. It reads the graph as you left it.",
  },
  {
    title: "Your keys",
    body: "When a graph needs a key this install does not have, the agent in Studio asks you for it in a dialog. A headless run fails instead of guessing.",
  },
];

export const APPROVAL_MODES = [
  {
    title: "Plan",
    body: "The agent investigates and proposes a plan. Nothing runs.",
  },
  {
    title: "Default",
    body: "Reads run on their own. You approve each action that changes, generates, or calls out before it runs.",
  },
  {
    title: "Auto",
    body: "The agent works without asking. Every tool call still goes into the log.",
  },
];

export const SURFACES: { title: string; body: string }[] = [
  { title: "Workflows", body: "Wires nodes, picks models, validates the graph, and runs it." },
  { title: "Storyboards", body: "Breaks a brief into shots and renders a frame for each one." },
  { title: "Timelines", body: "Places clips, trims the cuts, and renders the edit." },
  { title: "Scripts", body: "Drafts the scenes and voices the lines." },
  { title: "Sketches", body: "Builds a layered image and edits it one layer at a time." },
  { title: "3D scenes", body: "Places objects, lights, and materials, then renders the scene." },
  { title: "Games", body: "Places entities, writes their behaviors, generates the art, and play-tests the level." },
  { title: "Apps", body: "Places the widgets, binds them to a workflow, and checks that the app runs." },
];
