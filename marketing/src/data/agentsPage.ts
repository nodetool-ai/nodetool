/**
 * Copy for /agents, shared by the page and its Markdown mirror
 * (scripts/generate-llms-txt.mjs). Permission modes are checked against
 * decidePermission in packages/runtime/src/permission-gate.ts.
 */

export const AGENTS_LEAD =
  "NodeTool is open-source agentic creative software: an AI agent that operates creative tools and leaves work you can edit. Give a brief to the built-in agent, or connect Claude Code, Codex, or Cursor over MCP. The agent generates images, video, and audio, then builds the storyboard, timeline, sketch, game, or workflow. A harness is everything an agent works inside: tools, editors, models, keys, and a record of each step.";

export const APPROVAL_MODES_INTRO =
  "Each chat has a permission mode. Reading and searching run in every mode. The mode decides what happens to the rest.";

export const LOOP_STAGES = [
  {
    title: "Build",
    tool: "create_workflow",
    body: "The agent adds nodes, picks models, and wires the graph.",
  },
  {
    title: "Run",
    tool: "run_workflow",
    body: "The graph calls your local models and provider accounts.",
  },
  {
    title: "Inspect",
    tool: "get_job_logs",
    body: "Every tool call, output, and error is in the log.",
  },
  {
    title: "Repair",
    tool: "create_workflow_version",
    body: "The fix is a new version. The last good one stays.",
  },
];

export const CONTROLS = [
  {
    title: "Your models",
    body: "Run the agent on Claude, GPT, Gemini, or a local model through Ollama. Each node names its own model.",
  },
  {
    title: "Your keys",
    body: "Each generation is billed to your own provider account at its list price. NodeTool sells no credits.",
  },
  {
    title: "A full record",
    body: "Read each tool call with its arguments, result, and error. Find the step that went wrong.",
  },
  {
    title: "Your hands",
    body: "Stop the agent, change a node yourself, and hand the work back. It reads the graph as you left it.",
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

export const MCP_STEPS = [
  {
    title: "Install",
    body: "The command finds the coding agents on your computer and adds NodeTool to each one's settings. It needs Node.js 22.",
  },
  {
    title: "Restart the agent",
    body: "Then ask it: “List my NodeTool workflows.”",
  },
  {
    title: "Store your keys",
    body: "Run nodetool secrets store once per provider, such as FAL_API_KEY.",
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
