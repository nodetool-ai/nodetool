/**
 * Workflow gallery — Creative Story Ideas.
 *
 *   Genre ─┐
 *          ├→ Prompt (template) → List Generator (streams ideas)
 *   Character ┘
 *
 * A beginner pipeline: two inputs fill a prompt template, and a List Generator
 * streams story concepts one at a time. Fully synthetic — the ideas are canned,
 * so it replays with no backend.
 */
import { CAST_VERSION, type CastEvent, type DemoCast } from "../castTypes";
import { castMessages, prop } from "../castHelpers";
import {
  cookbookWorkflow,
  edge,
  fitViewport,
  listGeneratorMeta,
  node,
  simpleMeta,
  stringInputMeta,
} from "../cookbook/builders";

const STRING_INPUT = "nodetool.input.StringInput";
const PROMPT = "nodetool.text.Prompt";
const LIST = "nodetool.generators.ListGenerator";

const WF = "wf-workflow-creative-story-ideas";
const JOB = "workflow-creative-story-ideas-job";
const m = castMessages(WF, JOB);

const GENRE = "space opera";
const CHARACTER = "a retired cartographer";
const PROMPT_TEXT =
  "Give five one-line story ideas in the space opera genre featuring a retired cartographer.";
const IDEAS = [
  "A retired cartographer is hired to map a star that shouldn't exist.",
  "Her old charts hide the coordinates of a vanished colony.",
  "A rival maps the same void and one of the maps is a lie.",
  "The last accurate map of the galaxy is tattooed on her hands.",
  "To find home she must chart the space between two dying suns.",
];

const nodes = [
  node("genre", STRING_INPUT, 0, 40, 240, "Genre", { name: "genre", value: GENRE }),
  node("character", STRING_INPUT, 0, 300, 240, "Character", { name: "character", value: CHARACTER }),
  node("prompt", PROMPT, 360, 160, 300, "Prompt", {
    prompt: "Give five one-line story ideas in the {{ genre }} genre featuring {{ character }}.",
  }),
  node("ideas", LIST, 760, 160, 340, "Story Ideas", { prompt: "" }),
];
const edges = [
  edge("e1", "genre", "output", "prompt", "genre"),
  edge("e2", "character", "output", "prompt", "character"),
  edge("e3", "prompt", "output", "ideas", "prompt"),
];

const streamItems = (start: number, span: number): CastEvent[] =>
  IDEAS.flatMap((item, i) => {
    const t = Math.round(start + (span * i) / IDEAS.length);
    return [
      m.output(t, "ideas", "Story Ideas", "item", item, "str"),
      m.output(t + 20, "ideas", "Story Ideas", "index", i, "int"),
    ];
  });

const events: CastEvent[] = [
  m.jobUpdate(0, "running"),

  m.nodeUpdate(300, "genre", "Genre", STRING_INPUT, "running"),
  m.nodeUpdate(400, "character", "Character", STRING_INPUT, "running"),
  m.nodeUpdate(1300, "genre", "Genre", STRING_INPUT, "completed", { output: GENRE }),
  m.nodeUpdate(1400, "character", "Character", STRING_INPUT, "completed", { output: CHARACTER }),
  m.edgeUpdate(1600, "e1", "active"),
  m.edgeUpdate(1700, "e2", "active"),

  m.nodeUpdate(2400, "prompt", "Prompt", PROMPT, "running"),
  m.nodeUpdate(3200, "prompt", "Prompt", PROMPT, "completed", { output: PROMPT_TEXT }),
  m.edgeUpdate(3300, "e1", "completed"),
  m.edgeUpdate(3400, "e2", "completed"),
  m.edgeUpdate(3600, "e3", "active"),

  m.nodeUpdate(4200, "ideas", "Story Ideas", LIST, "running"),
  ...streamItems(4700, 6000),
  m.nodeUpdate(11200, "ideas", "Story Ideas", LIST, "completed", { output: IDEAS }),
  m.edgeUpdate(11400, "e3", "completed"),
  m.jobUpdate(11700, "completed", { outputs: { output: IDEAS } }),
];

export const creativeStoryIdeasCast: DemoCast = {
  version: CAST_VERSION,
  id: "workflow-creative-story-ideas",
  name: "Creative Story Ideas",
  description: "Turn a genre and a character into a stream of story concepts.",
  createdAt: new Date(0).toISOString(),
  durationMs: 12500,
  fps: 30,
  workflow: cookbookWorkflow(
    WF,
    "Creative Story Ideas",
    "Genre + Character → Prompt → List Generator.",
    nodes,
    edges
  ),
  metadata: {
    [STRING_INPUT]: stringInputMeta(),
    [PROMPT]: simpleMeta(PROMPT, "Prompt", "str", {
      inputs: ["genre", "character"],
      inline: ["prompt"],
      properties: [prop("prompt", "str"), prop("genre", "str"), prop("character", "str")],
    }),
    [LIST]: listGeneratorMeta(),
  },
  events,
  assets: [],
  viewport: fitViewport(nodes),
};
