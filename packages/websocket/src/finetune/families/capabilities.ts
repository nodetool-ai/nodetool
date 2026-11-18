/**
 * Generated tasks for the agent's own server capabilities: workflows, memory
 * and skills, reached as `nodetool.*` inside `execute_code` rather than
 * through a browser editor.
 *
 * Each world is a fresh user. Its starting state is seeded through the same
 * capabilities the model calls, the chat session runs as that user, and the
 * checks read the user's rows back from the database after the turn. Nothing
 * here runs a workflow, generates media or needs a provider key.
 */
import { randomUUID } from "node:crypto";
import { createCapabilityRun } from "@nodetool-ai/agents";
import { Memory, Skill, Workflow } from "@nodetool-ai/models";
import { ProcessingContext, headlessGate } from "@nodetool-ai/runtime";
import { z } from "zod";
import {
  defineFamily,
  list,
  type CallTool,
  type Check,
  type ErasedFamily,
  type Picker,
  type TaskBridge,
  type TaskFamily
} from "../task-families.js";

// ---------------------------------------------------------------- server state

// Workflow rows and capability answers are parsed here, at the boundary;
// everything past it reads typed values.
const nodeValue = z.union([z.string(), z.number(), z.boolean(), z.null()]).catch(null);
const storedGraphSchema = z
  .object({
    nodes: z
      .array(z.object({ id: z.string(), type: z.string(), data: z.record(z.string(), nodeValue).catch({}) }))
      .catch([]),
    edges: z
      .array(
        z.object({
          source: z.string(),
          target: z.string(),
          sourceHandle: z.string().nullish().transform((h) => h || "output"),
          targetHandle: z.string().catch("")
        })
      )
      .catch([])
  })
  .catch({ nodes: [], edges: [] });

type StoredGraph = z.infer<typeof storedGraphSchema>;
type StoredNode = StoredGraph["nodes"][number];

interface StoredWorkflow extends StoredGraph {
  name: string;
  tags: string[];
  description: string;
}

export interface ServerState {
  workflows: StoredWorkflow[];
  memories: string[];
  skills: Array<{ name: string; description: string; content: string }>;
}

/** What a capability answers when it reports failure instead of throwing. */
const failureSchema = z.object({ success: z.literal(false).optional(), error: z.string().optional() });
const workflowListSchema = z.object({ workflows: z.array(z.object({ id: z.string(), name: z.string() })).catch([]) });
const memoryListSchema = z.object({ memories: z.array(z.object({ memory_id: z.string(), content: z.string() })).catch([]) });

async function readState(userId: string): Promise<ServerState> {
  const [workflows] = await Workflow.paginate(userId, { limit: 500 });
  const memories = await Memory.list(userId, { limit: 500 });
  const skills = await Skill.listByUser(userId, 500);
  return {
    workflows: workflows.map((w) => ({
      name: w.name,
      tags: z.array(z.string()).catch([]).parse(w.tags),
      description: w.description ?? "",
      ...storedGraphSchema.parse(w.graph)
    })),
    memories: memories.map((m) => `${m.title} ${m.content}`),
    skills: skills.map((s) => ({ name: s.name, description: s.description, content: s.content }))
  };
}

/** The error a capability answer reports, or null when it succeeded. */
function failure(result: Awaited<ReturnType<CallTool>>): string | null {
  const parsed = failureSchema.safeParse(result);
  if (!parsed.success) return null;
  if (parsed.data.success === false) return parsed.data.error ?? "failed";
  return parsed.data.error ?? null;
}

let worlds = 0;

/**
 * A new user with `seed` applied through the capabilities. The state is read
 * once now, so an untouched world can be graded, and again on every `settle`.
 */
async function serverWorld(seed: (call: CallTool) => Promise<void>): Promise<TaskBridge<ServerState>> {
  worlds += 1;
  const userId = `finetune-${process.pid}-${worlds}-${randomUUID().slice(0, 8)}`;
  const run = createCapabilityRun({
    context: new ProcessingContext({ jobId: `seed-${userId}`, userId }),
    gate: headlessGate("finetune capability world")
  });
  const call: CallTool = (name, args) => run.invoke(name, args);
  await seed(async (name, args) => {
    const result = await call(name, args);
    const error = failure(result);
    if (error !== null) throw new Error(`seeding ${name} failed: ${error}`);
    return result;
  });
  let state = await readState(userId);
  return {
    tools: [],
    finalState: () => state,
    userId,
    settle: async () => {
      state = await readState(userId);
    },
    call
  };
}

const lower = (s: string) => s.toLowerCase();
const mentions = (haystack: string, needle: string) => lower(haystack).includes(lower(needle));
const quoted = (s: string) => `"${s}"`;
const sentence = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------- workflow graphs

interface PlanNode {
  key: string;
  type: string;
  props: Record<string, string | number>;
  /** How the request names this step. */
  phrase: string;
  /** The output the next step reads. */
  out: string;
}

interface PlanEdge {
  from: string;
  to: string;
  sourceHandle: string;
  targetHandle: string;
}

interface Plan {
  nodes: PlanNode[];
  edges: PlanEdge[];
}

const INPUT_NAMES = ["topic", "subject", "prompt", "idea", "headline", "caption", "product", "theme"];
const IMAGE_INPUT_NAMES = ["photo", "picture", "upload", "image", "snapshot"];
const OUTPUT_NAMES = ["poster", "result", "cover", "voiceover", "summary", "thumbnail", "banner", "narration", "final"];
const CONSTANT_PROMPTS = [
  "a red fox in fresh snow", "a lighthouse at dusk", "a cup of coffee on a wooden desk",
  "a neon street in the rain", "a paper boat on a pond", "a mountain cabin at sunrise"
];
const TEMPLATES = [
  "A bold poster about {{v}}", "A watercolor painting of {{v}}", "Explain {{v}} in two sentences",
  "A product photo of {{v}} on white", "Write a short intro for {{v}}", "A cinematic still of {{v}}"
];
const SIZES = [256, 512, 768, 1024];
const WORKFLOW_NAMES = [
  "Poster Maker", "Daily Digest", "Cover Art", "Voice Note", "Thumbnail Resizer", "Story Starter",
  "Product Shots", "Podcast Intro", "Social Teaser", "Moodboard", "Quick Summary", "Banner Builder"
];

/** What the pipeline makes. */
type Kind = "image" | "speech" | "summary" | "resize" | "template";

function plan(pick: Picker): Plan {
  const kind = pick.one<Kind>(["image", "speech", "summary", "resize", "template"]);
  const nodes: PlanNode[] = [];
  const edges: PlanEdge[] = [];
  const add = (node: PlanNode, targetHandle?: string) => {
    const prev = nodes.at(-1);
    if (prev && targetHandle) edges.push({ from: prev.key, to: node.key, sourceHandle: prev.out, targetHandle });
    nodes.push(node);
  };
  let variable = "text";
  if (kind === "resize") {
    const name = pick.one(IMAGE_INPUT_NAMES);
    add({ key: "input", type: "nodetool.input.ImageInput", props: { name }, out: "output", phrase: `an image input named ${quoted(name)} (nodetool.input.ImageInput)` });
  } else if (kind === "image" && pick.chance(0.35)) {
    const value = pick.one(CONSTANT_PROMPTS);
    add({ key: "input", type: "nodetool.constant.String", props: { value }, out: "output", phrase: `a constant string ${quoted(value)} (nodetool.constant.String)` });
  } else {
    variable = pick.one(INPUT_NAMES);
    add({ key: "input", type: "nodetool.input.StringInput", props: { name: variable }, out: "output", phrase: `a string input named ${quoted(variable)} (nodetool.input.StringInput)` });
  }
  if (kind === "template" || ((kind === "image" || kind === "speech") && pick.chance(0.5))) {
    const string = pick.one(TEMPLATES).replace("v", variable);
    add(
      { key: "template", type: "nodetool.text.Template", props: { string }, out: "output", phrase: `a template ${quoted(string)} (nodetool.text.Template) fed on its ${quoted(variable)} input` },
      variable
    );
  }
  if (kind === "summary") {
    add({ key: "summarize", type: "nodetool.agents.Summarizer", props: {}, out: "text", phrase: `a summarizer (nodetool.agents.Summarizer) reading its ${quoted("text")} input, with its result on the ${quoted("text")} output` }, "text");
  }
  const tail = kind === "template" ? pick.one(["image", "speech", "none"] as const) : kind;
  if (tail === "image") {
    add({ key: "generate", type: "nodetool.image.TextToImage", props: {}, out: "output", phrase: `an image generator (nodetool.image.TextToImage) taking it as its ${quoted("prompt")}` }, "prompt");
  }
  if (tail === "speech" || (kind === "summary" && pick.chance(0.4))) {
    add({ key: "speak", type: "nodetool.audio.TextToSpeech", props: {}, out: "audio", phrase: `text to speech (nodetool.audio.TextToSpeech) on its ${quoted("text")} input, with the sound on its ${quoted("audio")} output` }, "text");
  }
  if (kind === "resize" || (tail === "image" && pick.chance(0.5))) {
    const size = pick.one(SIZES);
    add({ key: "resize", type: "nodetool.image.Resize", props: { width: size, height: size }, out: "output", phrase: `a resize to ${size}x${size} (nodetool.image.Resize, ${quoted("image")} input)` }, "image");
  }
  if (pick.chance(0.8)) {
    const name = pick.one(OUTPUT_NAMES);
    add({ key: "output", type: "nodetool.output.Output", props: { name }, out: "output", phrase: `an output named ${quoted(name)} (nodetool.output.Output, ${quoted("value")} input)` }, "value");
  } else {
    add({ key: "preview", type: "nodetool.workflows.base_node.Preview", props: {}, out: "output", phrase: `a preview (nodetool.workflows.base_node.Preview, ${quoted("value")} input)` }, "value");
  }
  return { nodes, edges };
}

/** The graph `create_workflow` and `update_workflow` take. */
const graphArg = (p: Plan) => ({
  nodes: p.nodes.map((n) => ({ id: n.key, type: n.type, properties: n.props })),
  edges: p.edges.map((e) => ({ source: e.from, target: e.to, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle }))
});

const named = (s: ServerState, name: string) => s.workflows.filter((w) => w.name === name);
const sameValue = (a: StoredNode["data"][string] | undefined, b: string | number) => String(a ?? "").trim() === String(b);
const nodeMatches = (n: StoredNode, p: PlanNode) =>
  n.type === p.type && Object.entries(p.props).every(([k, v]) => sameValue(n.data[k], v));

/** Checks that the one workflow named `name` holds every step and link of `p`. */
function graphChecks(name: string, p: Plan): Check<ServerState>[] {
  const typeOf = (key: string) => p.nodes.find((n) => n.key === key)!.type;
  const only = (s: ServerState) => {
    const found = named(s, name);
    return found.length === 1 ? found[0]! : null;
  };
  return [
    ...p.nodes.map((n) => ({
      name: `${name}: ${n.type}${Object.keys(n.props).length ? ` ${JSON.stringify(n.props)}` : ""}`,
      test: (s: ServerState) => !!only(s)?.nodes.some((stored) => nodeMatches(stored, n))
    })),
    ...p.edges.map((e) => ({
      name: `${name}: ${typeOf(e.from)}.${e.sourceHandle} -> ${typeOf(e.to)}.${e.targetHandle}`,
      test: (s: ServerState) => {
        const w = only(s);
        if (!w) return false;
        const type = new Map(w.nodes.map((n) => [n.id, n.type]));
        return w.edges.some(
          (stored) =>
            type.get(stored.source) === typeOf(e.from) &&
            type.get(stored.target) === typeOf(e.to) &&
            stored.sourceHandle === e.sourceHandle &&
            stored.targetHandle === e.targetHandle
        );
      }
    })),
    { name: `${name}: ${p.nodes.length} nodes`, test: (s) => only(s)?.nodes.length === p.nodes.length }
  ];
}

export const WORKFLOW_BUILD: TaskFamily<ServerState> = {
  id: "workflow-build",
  make(pick) {
    const name = pick.one(WORKFLOW_NAMES);
    const p = plan(pick);
    const opener = pick.one([
      `Create a workflow named ${quoted(name)} that chains`,
      `Build me a new workflow called ${quoted(name)}:`,
      `Save a workflow ${quoted(name)} made of`,
      `I need a workflow named ${quoted(name)} with`
    ]);
    const ending = pick.one(["Each step feeds the next. Just save it, don't run it.", "Wire each step into the next one. Don't run it yet."]);
    return {
      objective: `${opener} ${list(p.nodes.map((n) => n.phrase))}. ${ending}`,
      createBridge: () => serverWorld(async () => {}),
      checks: [{ name: `one workflow named ${name}`, test: (s) => named(s, name).length === 1 }, ...graphChecks(name, p)],
      solve: async (call) => {
        await call("create_workflow", { name, graph: graphArg(p) });
      }
    };
  }
};

export const WORKFLOW_EDIT: TaskFamily<ServerState> = {
  id: "workflow-edit",
  make(pick) {
    const name = pick.one(WORKFLOW_NAMES);
    const seed = plan(pick);
    const tags = pick.some(["draft", "client", "social", "audio", "image", "weekly"], pick.int(0, 2));
    // The plan after the edits; the seeded one stays as it was.
    const next: Plan = { nodes: seed.nodes.map((n) => ({ ...n, props: { ...n.props } })), edges: seed.edges.map((e) => ({ ...e })) };
    const meta = { name, tags, description: "" };
    const has = (key: string) => next.nodes.some((n) => n.key === key);
    const options = ["rename", "retag", "describe", "set-prop"];
    if (has("template")) options.push("drop-template");
    if (has("generate") && !has("resize")) options.push("add-resize");
    const asks: string[] = [];
    const checks: Check<ServerState>[] = [];
    for (const op of pick.some(options, pick.int(1, 3))) {
      if (op === "rename") {
        meta.name = pick.one(WORKFLOW_NAMES.filter((n) => n !== name));
        asks.push(`rename it to ${quoted(meta.name)}`);
        checks.push({ name: `old name ${name} gone`, test: (s) => named(s, name).length === 0 });
      } else if (op === "retag") {
        meta.tags = pick.some(["final", "approved", "archive", "team", "demo", "v2"], pick.int(1, 2));
        asks.push(`set its tags to ${list(meta.tags.map(quoted))}`);
        checks.push({ name: `tags ${meta.tags.join(",")}`, test: (s) => [...(named(s, meta.name)[0]?.tags ?? [])].sort().join(",") === [...meta.tags].sort().join(",") });
      } else if (op === "describe") {
        meta.description = pick.one(["Makes the weekly social image", "Turns notes into a voice memo", "Used for client previews", "Resizes uploads for the shop"]);
        asks.push(`give it the description ${quoted(meta.description)}`);
        checks.push({ name: `description ${meta.description}`, test: (s) => named(s, meta.name)[0]?.description === meta.description });
      } else if (op === "set-prop") {
        const node = pick.one(next.nodes.filter((n) => Object.keys(n.props).length > 0));
        if (node.type === "nodetool.image.Resize") {
          const size = pick.one(SIZES.filter((x) => x !== node.props.width));
          node.props = { width: size, height: size };
          asks.push(`change the resize to ${size}x${size}`);
        } else if (node.type === "nodetool.text.Template") {
          const variable = seed.edges.find((e) => e.to === "template")!.targetHandle;
          const string = pick.one(TEMPLATES.filter((t) => t.replace("v", variable) !== node.props.string)).replace("v", variable);
          node.props = { string };
          asks.push(`change the template text to ${quoted(string)}`);
        } else if (node.type === "nodetool.constant.String") {
          const value = pick.one(CONSTANT_PROMPTS.filter((v) => v !== node.props.value));
          node.props = { value };
          asks.push(`change the constant string to ${quoted(value)}`);
        } else {
          const pool = node.type === "nodetool.output.Output" ? OUTPUT_NAMES : node.type === "nodetool.input.ImageInput" ? IMAGE_INPUT_NAMES : INPUT_NAMES;
          const was = String(node.props.name);
          const value = pick.one(pool.filter((v) => v !== was));
          node.props = { name: value };
          asks.push(`rename the ${node.type.split(".").at(-1)} node ${quoted(was)} to ${quoted(value)}`);
        }
      } else if (op === "drop-template") {
        const into = next.edges.find((e) => e.from === "template")!;
        next.nodes = next.nodes.filter((n) => n.key !== "template");
        next.edges = next.edges.filter((e) => e.from !== "template" && e.to !== "template");
        next.edges.push({ from: "input", to: into.to, sourceHandle: "output", targetHandle: into.targetHandle });
        asks.push(`remove the template step and wire the input straight into the ${quoted(into.targetHandle)} input of the step after it`);
        checks.push({ name: "no template node", test: (s) => !named(s, meta.name)[0]?.nodes.some((n) => n.type === "nodetool.text.Template") });
      } else {
        const size = pick.one(SIZES);
        const out = next.edges.find((e) => e.from === "generate")!;
        next.edges = next.edges.filter((e) => e !== out);
        const at = next.nodes.findIndex((n) => n.key === "generate") + 1;
        next.nodes.splice(at, 0, { key: "resize", type: "nodetool.image.Resize", props: { width: size, height: size }, out: "output", phrase: "" });
        next.edges.push({ from: "generate", to: "resize", sourceHandle: "output", targetHandle: "image" });
        next.edges.push({ from: "resize", to: out.to, sourceHandle: "output", targetHandle: out.targetHandle });
        asks.push(`put a resize to ${size}x${size} (nodetool.image.Resize) between the image generator and the step after it`);
      }
    }
    checks.unshift({ name: `one workflow named ${meta.name}`, test: (s) => named(s, meta.name).length === 1 });
    checks.push(...graphChecks(meta.name, next));
    if (!asks.some((a) => a.startsWith("set its tags"))) {
      checks.push({ name: "tags unchanged", test: (s) => [...(named(s, meta.name)[0]?.tags ?? [])].sort().join(",") === [...tags].sort().join(",") });
    }
    return {
      objective: `In my workflow ${quoted(name)}, ${list(asks)}. Leave the rest of it as it is and don't run it.`,
      createBridge: () => serverWorld(async (call) => {
        await call("create_workflow", { name, graph: graphArg(seed), tags });
      }),
      checks,
      solve: async (call) => {
        const listed = workflowListSchema.parse(await call("list_workflows", {}));
        const update: Record<string, string | string[] | ReturnType<typeof graphArg> | undefined> = {
          workflow_id: listed.workflows.find((w) => w.name === name)?.id,
          graph: graphArg(next),
          name: meta.name,
          tags: meta.tags
        };
        if (meta.description) update.description = meta.description;
        await call("update_workflow", update);
      }
    };
  }
};

export const WORKFLOW_ORGANIZE: TaskFamily<ServerState> = {
  id: "workflow-organize",
  make(pick) {
    const names = pick.some(WORKFLOW_NAMES, pick.int(3, 5));
    const seed = names.map((name) => ({ name, input: pick.one(INPUT_NAMES), tags: pick.some(["draft", "client", "social", "audio", "image"], pick.int(0, 2)) }));
    const ops = pick.some(["rename", "retag", "delete", "describe"] as const, pick.int(2, 3));
    const targets = pick.some(seed, ops.length);
    const asks: string[] = [];
    const checks: Check<ServerState>[] = [];
    const steps: Array<{ target: string; args: Record<string, string | string[]> | null }> = [];
    ops.forEach((op, i) => {
      const t = targets[i]!;
      if (op === "rename") {
        const to = pick.one(WORKFLOW_NAMES.filter((n) => !names.includes(n)));
        steps.push({ target: t.name, args: { name: to } });
        asks.push(`rename ${quoted(t.name)} to ${quoted(to)}`);
        checks.push({ name: `${t.name} renamed ${to}`, test: (s) => named(s, to).length === 1 && named(s, t.name).length === 0 });
      } else if (op === "retag") {
        const tags = pick.some(["final", "approved", "archive", "team", "demo"], pick.int(1, 2));
        steps.push({ target: t.name, args: { tags } });
        asks.push(`tag ${quoted(t.name)} with ${list(tags.map(quoted))} instead of its current tags`);
        checks.push({ name: `${t.name} tags ${tags.join(",")}`, test: (s) => [...(named(s, t.name)[0]?.tags ?? [])].sort().join(",") === [...tags].sort().join(",") });
      } else if (op === "delete") {
        steps.push({ target: t.name, args: null });
        asks.push(`delete ${quoted(t.name)}`);
        checks.push({ name: `${t.name} deleted`, test: (s) => named(s, t.name).length === 0 });
      } else {
        const description = pick.one(["Runs every Monday", "Only for the spring campaign", "Ask Dana before changing", "Exports for the web shop"]);
        steps.push({ target: t.name, args: { description } });
        asks.push(`set the description of ${quoted(t.name)} to ${quoted(description)}`);
        checks.push({ name: `${t.name} described`, test: (s) => named(s, t.name)[0]?.description === description });
      }
    });
    for (const w of seed.filter((w) => !targets.includes(w))) {
      checks.push({ name: `${w.name} left alone`, test: (s) => named(s, w.name).length === 1 && [...named(s, w.name)[0]!.tags].sort().join(",") === [...w.tags].sort().join(",") });
    }
    checks.push({ name: `${seed.length - (ops.includes("delete") ? 1 : 0)} workflows`, test: (s) => s.workflows.length === seed.length - (ops.includes("delete") ? 1 : 0) });
    return {
      objective: `Tidy up my workflows: ${list(asks)}. Leave the other workflows alone.`,
      createBridge: () => serverWorld(async (call) => {
        for (const w of seed) {
          await call("create_workflow", {
            name: w.name,
            tags: w.tags,
            graph: graphArg({
              nodes: [
                { key: "input", type: "nodetool.input.StringInput", props: { name: w.input }, out: "output", phrase: "" },
                { key: "output", type: "nodetool.output.Output", props: { name: "result" }, out: "output", phrase: "" }
              ],
              edges: [{ from: "input", to: "output", sourceHandle: "output", targetHandle: "value" }]
            })
          });
        }
      }),
      checks,
      solve: async (call) => {
        const listed = workflowListSchema.parse(await call("list_workflows", {}));
        for (const step of steps) {
          const id = listed.workflows.find((w) => w.name === step.target)?.id;
          if (step.args === null) await call("delete_workflow", { workflow_id: id });
          else await call("update_workflow", { workflow_id: id, ...step.args });
        }
      }
    };
  }
};

// ---------------------------------------------------------------- memory

interface Fact {
  topic: string;
  say: (value: string) => string;
  values: string[];
}

const FACTS: Fact[] = [
  { topic: "city", say: (v) => `I live in ${v}`, values: ["Berlin", "Lisbon", "Osaka", "Toronto", "Nairobi"] },
  { topic: "dog", say: (v) => `my dog is called ${v}`, values: ["Rex", "Biscuit", "Momo", "Pepper", "Juno"] },
  { topic: "video editor", say: (v) => `I edit my videos in ${v}`, values: ["DaVinci Resolve", "Premiere Pro", "Final Cut Pro", "Kdenlive"] },
  { topic: "brand color", say: (v) => `our brand color is ${v}`, values: ["#e63946", "#2a9d8f", "#7b2cbf", "#f4a261"] },
  { topic: "name", say: (v) => `I'd like to be called ${v}`, values: ["Sam", "Priya", "Tomasz", "Aiko", "Lena"] },
  { topic: "answer language", say: (v) => `I prefer answers in ${v}`, values: ["German", "Spanish", "French", "Japanese"] },
  { topic: "time zone", say: (v) => `I work on ${v} time`, values: ["CET", "PST", "JST", "IST"] },
  { topic: "export format", say: (v) => `I want video exports as ${v}`, values: ["MP4", "MOV", "WebM"] },
  { topic: "client", say: (v) => `my main client is ${v}`, values: ["Northwind", "Bluebird Cafe", "Orbit Labs", "Kestrel Bikes"] },
  { topic: "aspect ratio", say: (v) => `my default aspect ratio is ${v}`, values: ["9:16", "16:9", "4:5", "1:1"] }
];

export const MEMORY_EDIT: TaskFamily<ServerState> = {
  id: "memory-edit",
  make(pick) {
    const facts = pick.some(FACTS, 5);
    const seeded = facts.slice(0, pick.int(1, 3)).map((f) => ({ fact: f, value: pick.one(f.values) }));
    const fresh = facts.slice(seeded.length);
    const ops = pick.some(["remember", "update", "forget"] as const, pick.int(1, 3));
    if (!ops.includes("remember") && pick.chance(0.4)) ops.push("remember");
    const asks: string[] = [];
    const checks: Check<ServerState>[] = [];
    const touched = new Set<string>();
    const steps: Array<(call: CallTool, ids: Map<string, string>) => Promise<void>> = [];
    let freshIndex = 0;
    for (const op of ops) {
      const free = seeded.filter((s) => !touched.has(s.fact.topic));
      if (op === "remember") {
        const fact = fresh[freshIndex++];
        if (!fact) continue;
        const value = pick.one(fact.values);
        asks.push(`remember that ${fact.say(value)}`);
        checks.push({ name: `remembers ${fact.topic} ${value}`, test: (s) => s.memories.some((m) => mentions(m, value)) });
        steps.push(async (call) => {
          await call("memory_save", { content: sentence(fact.say(value)) + "." });
        });
      } else if (free.length > 0) {
        const target = pick.one(free);
        touched.add(target.fact.topic);
        if (op === "update") {
          const value = pick.one(target.fact.values.filter((v) => v !== target.value));
          asks.push(`${target.fact.say(value)} now, not ${target.value}, so update what you remember`);
          checks.push({ name: `${target.fact.topic} is ${value}`, test: (s) => s.memories.some((m) => mentions(m, value)) });
          checks.push({ name: `${target.fact.topic} ${target.value} gone`, test: (s) => !s.memories.some((m) => mentions(m, target.value)) });
          steps.push(async (call, ids) => {
            await call("memory_update", { memory_id: ids.get(target.fact.topic), content: sentence(target.fact.say(value)) + "." });
          });
        } else {
          asks.push(`forget what you know about my ${target.fact.topic}`);
          checks.push({ name: `${target.fact.topic} forgotten`, test: (s) => !s.memories.some((m) => mentions(m, target.value)) });
          steps.push(async (call, ids) => {
            await call("memory_delete", { memory_id: ids.get(target.fact.topic) });
          });
        }
      }
    }
    if (asks.length === 0) {
      const fact = fresh[0]!;
      const value = fact.values[0]!;
      asks.push(`remember that ${fact.say(value)}`);
      checks.push({ name: `remembers ${fact.topic} ${value}`, test: (s) => s.memories.some((m) => mentions(m, value)) });
      steps.push(async (call) => {
        await call("memory_save", { content: sentence(fact.say(value)) + "." });
      });
    }
    for (const s of seeded.filter((x) => !touched.has(x.fact.topic))) {
      checks.push({ name: `${s.fact.topic} kept`, test: (state) => state.memories.some((m) => mentions(m, s.value)) });
    }
    return {
      objective: `${sentence(list(asks))}.`,
      createBridge: () => serverWorld(async (call) => {
        for (const s of seeded) await call("memory_save", { content: sentence(s.fact.say(s.value)) + "." });
      }),
      checks,
      solve: async (call) => {
        const listed = memoryListSchema.parse(await call("memory_list", {}));
        const ids = new Map<string, string>();
        for (const s of seeded) {
          const id = listed.memories.find((m) => mentions(m.content, s.value))?.memory_id;
          if (id) ids.set(s.fact.topic, id);
        }
        for (const step of steps) await step(call, ids);
      }
    };
  }
};

// ---------------------------------------------------------------- skills

interface Rule {
  text: string;
  /** A phrase the skill's content must keep, whatever the wording around it. */
  key: string;
}

const RULES: Rule[] = [
  { text: "Keep every caption under 12 words.", key: "12 words" },
  { text: "Never use emoji.", key: "emoji" },
  { text: "Write numbers as digits.", key: "digits" },
  { text: "End with a question to the viewer.", key: "question" },
  { text: "Use British spelling.", key: "British" },
  { text: "Put the product name in the first line.", key: "product name" },
  { text: "Avoid exclamation marks.", key: "exclamation" },
  { text: "Use sentence case for titles.", key: "sentence case" },
  { text: "Credit the photographer at the end.", key: "photographer" },
  { text: "Mention the price only in the last scene.", key: "price" },
  { text: "Keep voiceover lines under 8 seconds.", key: "8 seconds" },
  { text: "Use #e63946 for highlights.", key: "#e63946" }
];

const SKILL_TOPICS: Array<[string, string]> = [
  ["captions", "How we write captions for social clips"],
  ["thumbnails", "How we design video thumbnails"],
  ["voiceover", "How we script voiceovers"],
  ["product-shots", "How we brief product photos"],
  ["podcast-notes", "How we write podcast show notes"],
  ["release-notes", "How we write release notes"],
  ["shot-lists", "How we plan shot lists"],
  ["subtitles", "How we format subtitles"]
];
const SKILL_PREFIXES = ["acme", "northwind", "orbit", "kestrel", "bluebird"];

const skillNamed = (s: ServerState, name: string) => s.skills.find((k) => k.name === name);
const keepsRules = (content: string | undefined, rules: Rule[]) => content !== undefined && rules.every((r) => mentions(content, r.key));
const bullets = (rules: Rule[]) => rules.map((r) => `- ${r.text}`).join("\n");

export const SKILL_CREATE: TaskFamily<ServerState> = {
  id: "skill-create",
  make(pick) {
    const [topic, description] = pick.one(SKILL_TOPICS);
    const name = `${pick.one(SKILL_PREFIXES)}-${topic}`;
    const rules = pick.some(RULES, pick.int(2, 4));
    const opener = pick.one([
      `Create a skill named ${quoted(name)} with the description ${quoted(description)}.`,
      `Save a new skill ${quoted(name)}, described as ${quoted(description)}.`,
      `Make me a reusable skill called ${quoted(name)} (description: ${quoted(description)}).`
    ]);
    return {
      objective: `${opener} Its instructions:\n${bullets(rules)}`,
      createBridge: () => serverWorld(async () => {}),
      checks: [
        { name: `skill ${name} exists`, test: (s) => !!skillNamed(s, name) },
        { name: `${name} description`, test: (s) => skillNamed(s, name)?.description.trim() === description },
        ...rules.map((r) => ({ name: `${name} says ${r.key}`, test: (s: ServerState) => mentions(skillNamed(s, name)?.content ?? "", r.key) }))
      ],
      solve: async (call) => {
        await call("create_skill", { name, description, content: bullets(rules) });
      }
    };
  }
};

export const SKILL_EDIT: TaskFamily<ServerState> = {
  id: "skill-edit",
  make(pick) {
    const topics = pick.some(SKILL_TOPICS, pick.int(2, 3));
    const prefix = pick.one(SKILL_PREFIXES);
    const pool = pick.some(RULES, RULES.length);
    const seed = topics.map(([topic, description], i) => ({ name: `${prefix}-${topic}`, description, rules: pool.slice(i * 2, i * 2 + 2) }));
    const spare = pool.slice(seed.length * 2);
    const ops = pick.some(["add-rule", "rename", "describe", "delete"] as const, pick.int(1, 2));
    const targets = pick.some(seed, ops.length);
    const asks: string[] = [];
    const checks: Check<ServerState>[] = [];
    const steps: Array<[string, Record<string, string>]> = [];
    ops.forEach((op, i) => {
      const t = targets[i]!;
      if (op === "add-rule") {
        const rule = spare[i]!;
        steps.push(["update_skill", { name: t.name, content: bullets([...t.rules, rule]) }]);
        asks.push(`add the rule ${quoted(rule.text)} to ${quoted(t.name)}, keeping its current rules`);
        checks.push({ name: `${t.name} gains ${rule.key}`, test: (s) => keepsRules(skillNamed(s, t.name)?.content, [...t.rules, rule]) });
      } else if (op === "rename") {
        const to = `${pick.one(SKILL_PREFIXES.filter((p) => p !== prefix))}-${t.name.slice(prefix.length + 1)}`;
        steps.push(["update_skill", { name: t.name, new_name: to }]);
        asks.push(`rename ${quoted(t.name)} to ${quoted(to)}`);
        checks.push({ name: `${t.name} renamed ${to}`, test: (s) => !skillNamed(s, t.name) && keepsRules(skillNamed(s, to)?.content, t.rules) });
      } else if (op === "describe") {
        const description = `${t.description} for the ${pick.one(["spring", "holiday", "launch", "summer"])} campaign`;
        steps.push(["update_skill", { name: t.name, description }]);
        asks.push(`change the description of ${quoted(t.name)} to ${quoted(description)}`);
        checks.push({ name: `${t.name} description`, test: (s) => skillNamed(s, t.name)?.description.trim() === description && keepsRules(skillNamed(s, t.name)?.content, t.rules) });
      } else {
        steps.push(["delete_skill", { name: t.name }]);
        asks.push(`delete ${quoted(t.name)}`);
        checks.push({ name: `${t.name} deleted`, test: (s) => !skillNamed(s, t.name) });
      }
    });
    for (const k of seed.filter((x) => !targets.includes(x))) {
      checks.push({ name: `${k.name} left alone`, test: (s) => skillNamed(s, k.name)?.description === k.description && keepsRules(skillNamed(s, k.name)?.content, k.rules) });
    }
    return {
      objective: `In my skills, ${list(asks)}. Don't change the other skills.`,
      createBridge: () => serverWorld(async (call) => {
        for (const k of seed) await call("create_skill", { name: k.name, description: k.description, content: bullets(k.rules) });
      }),
      checks,
      solve: async (call) => {
        for (const [name, args] of steps) await call(name, args);
      }
    };
  }
};

export const CAPABILITY_FAMILIES: readonly ErasedFamily[] = [
  defineFamily(WORKFLOW_BUILD),
  defineFamily(WORKFLOW_EDIT),
  defineFamily(WORKFLOW_ORGANIZE),
  defineFamily(MEMORY_EDIT),
  defineFamily(SKILL_CREATE),
  defineFamily(SKILL_EDIT)
];
