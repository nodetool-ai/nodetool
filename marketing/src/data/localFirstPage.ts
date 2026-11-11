/**
 * Copy for /solutions/local-first: one local-model run, what it needs, what
 * stays on the machine, and what changes with the network off.
 *
 * Sources, so each line can be checked against code:
 * - The demo inputs are the shipped Private Assistant example
 *   (packages/base-nodes/nodetool/examples/nodetool-base/Private Assistant.json).
 * - Model sizes and memory come from the Model Manager's Get Started catalog
 *   (web/src/components/hugging_face/onboarding/onboardingCatalog.ts).
 * - Ollama's address is OLLAMA_DEFAULT_URL in
 *   packages/runtime/src/providers/defaults.ts.
 * - Auto-updates are opt-in in electron/src/updater.ts. Analytics are opt-in
 *   (docs/analytics.md).
 */
import type { MarketingFact } from "@/components/MarketingFacts";

export const DEMO_INPUTS: { name: string; value: string }[] = [
  {
    name: "document",
    value:
      "Team sync, Thursday\n- Launch date moved to March 14 (was March 7) to finish the accessibility fixes.\n- Budget: $8k left for Q1, reserved for the usability study.\n- Open risk: the billing migration hasn't been tested on staging yet.",
  },
  {
    name: "question",
    value: "When do we launch, and what's the biggest open risk?",
  },
  { name: "tone", value: "concise and neutral" },
];

export const DEMO_STEPS: { title: string; body: string }[] = [
  {
    title: "Pull a model",
    body: "Install Ollama and pull a chat model, or download one from the Model Manager in Studio. This is the only step that needs the network.",
  },
  {
    title: "Pick it on the Agent node",
    body: "Open the Private Assistant template and choose the Ollama model on its Agent node. The graph has no API key field to fill in.",
  },
  {
    title: "Run",
    body: "The Prompt node joins the notes, the question, and the tone. The Agent node sends them to Ollama on 127.0.0.1:11434, and the answer comes back to the Output node.",
  },
];

/** From onboardingCatalog.ts. Approximate, as the Model Manager labels them. */
export const LOCAL_MODELS: {
  name: string;
  download: string;
  memory: string;
  note: string;
}[] = [
  { name: "Qwen3.5 2B", download: "2.7 GB", memory: "4 GB", note: "Runs without a GPU" },
  { name: "Qwen3.5 9B", download: "6.6 GB", memory: "8 GB", note: "Chat and tool use" },
  { name: "GPT-OSS 20B", download: "14 GB", memory: "16 GB", note: "NodeTool's default local chat model" },
  { name: "Qwen3.6 27B", download: "17 GB", memory: "20 GB", note: "The largest of the four" },
];

export const STAYS_LOCAL: MarketingFact[] = [
  {
    term: "Your text",
    description:
      "The notes, the question, and the answer go from Studio to Ollama on the same machine. No request leaves it.",
  },
  {
    term: "The project",
    description:
      "The workflow, its inputs, and the run log are stored by Studio on your disk.",
  },
  {
    term: "Account",
    description: "None. Studio does not ask you to sign in to run a local model.",
  },
  {
    term: "Background calls",
    description:
      "Update checks and product analytics are off until you turn them on in Settings.",
  },
];

export const NETWORK_OFF: MarketingFact[] = [
  {
    term: "Still works",
    description:
      "This workflow, the editors, your project files, and any other node set to a model you already downloaded.",
  },
  {
    term: "Stops at the node",
    description:
      "A node set to a hosted model fails when it runs, and the run log names that node. Swap it for a local model and run again.",
  },
  {
    term: "Needs a connection",
    description:
      "Downloading models, web search and fetch nodes, and hosted providers.",
  },
];
