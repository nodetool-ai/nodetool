/**
 * Copy for /agents, shared by the page and its Markdown mirror
 * (scripts/generate-llms-txt.mjs). Permission modes are checked against
 * decidePermission in packages/runtime/src/permission-gate.ts.
 */

export const AGENTS_LEAD =
  "Give the agent tools to create and edit images, video, audio and workflows. Use NodeTool’s built-in agent, or connect Claude Code, Codex or Cursor through MCP. Inspect its work and take over whenever you need to.";

export const APPROVAL_MODES_INTRO =
  "Each chat has a permission mode. Reading and searching run in every mode. The mode decides what happens to the rest.";

export const LOOP_STAGES = [
  {
    title: "Build",
    tool: "create_workflow",
    body: "The agent adds nodes, picks models, and wires the graph. It checks that the selected providers and models exist before saving the workflow.",
  },
  {
    title: "Validate",
    tool: "validate_workflow",
    body: "Check the workflow for errors before calling a model.",
  },
  {
    title: "Run",
    tool: "run_workflow",
    body: "Run the workflow with local models or your provider accounts. Missing API keys are flagged before it starts.",
  },
  {
    title: "Inspect",
    tool: "get_job_logs",
    body: "Every tool call, output, and error is in the log, with the node that failed.",
  },
  {
    title: "Repair",
    tool: "create_workflow_version",
    body: "The agent saves its changes as a new version, so you can return to the previous one.",
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
  "Validation catches errors before the workflow makes paid model calls.";

/** Models and keys are on the page once, in its SpecStrip. */
export const CONTROLS = [
  {
    id: "record",
    title: "A full record",
    body: "Read each tool call with its arguments, result, and error. Find the step that went wrong.",
  },
  {
    id: "manual",
    title: "Take over at any time",
    body: "Stop the agent, change a node yourself, and hand the work back. It reads the graph as you left it.",
  },
  {
    id: "keys",
    title: "Your keys",
    body: "Studio asks you to add any missing API keys. Runs started without the interface stop with an error if a required key is missing.",
  },
] as const;

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
