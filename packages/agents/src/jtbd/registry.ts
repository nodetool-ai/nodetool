/**
 * The catalogue of jobs an agent is asked to get done.
 *
 * These are **end-to-end jobs**, not capability checks. Each is stated the way
 * a user would state it, handed to the agent as an objective in the user's own
 * words, and graded on whether the world it left behind is one the user would
 * accept. No job names a tool: what tool to reach for, and in what order, is
 * precisely what is under test.
 *
 * Two rules keep the catalogue honest.
 *
 * **Grade the outcome, not the route.** An outcome check asks "is there a
 * connected graph that produces an output" — never "was `ui_connect_nodes`
 * called". A model that finds a shorter route than the one we imagined has done
 * the job, and a catalogue that fails it is measuring our imagination.
 *
 * **Every job states its `so I can`.** The optimizer quotes the statement back
 * to a model when asking whether a run achieved anything, and an objective with
 * no stated purpose gives it nothing to judge against.
 *
 * The worlds are the same headless bridges the `tool-loop` eval suites drive,
 * composed rather than reimplemented, so a job cannot drift from the tool
 * contract those suites already pin.
 */

import { createToolLoopBridge } from "../evals/tool-loop-bridge.js";
import { TOOL_LOOP_NODE_CATALOG } from "../evals/tool-loop-cases.js";
import { createJsScriptToolBridge } from "../evals/surfaces/js-script.js";
import { createModel3DToolBridge } from "../evals/surfaces/model3d.js";
import { createScriptToolBridge } from "../evals/surfaces/script.js";
import { createSketchToolBridge } from "../evals/surfaces/sketch.js";
import { createExplainerStoryboardToolBridge, createStoryboardToolBridge } from "../evals/surfaces/storyboard.js";
import {
  createTimelineToolBridge,
  previewedAfterLastEdit,
  staggerSpanFitsClip,
  staggerUnitsOf
} from "../evals/surfaces/timeline.js";
import { findSystemSkill } from "../system-skills.js";
import { defineJob, type ErasedJob } from "./run.js";

const graphWorld = () =>
  createToolLoopBridge({ nodeMetadata: TOOL_LOOP_NODE_CATALOG });

const EXPLAINER_STORYBOARD_PROMPT = `${findSystemSkill("explainer-storyboard")?.content ?? ""}

Evaluation adapter: these entities already exist. Call list_entities and reuse
their ids: Lumen Style, Support Lead, Lumen Dashboard Mock, Glass Funnel. Make
a 60-second planned board only. Persist it with create_storyboard, set_board
entity_ids, and one add_shot op per beat. Use exact ordered slugs: problem,
stakes, shift, mechanism-1, mechanism-2, outcome-proof, cta, sign-off. Every
action names [Lumen Style]; dashboard mechanism actions say mock; proof includes
[CLIENT INPUT NEEDED]. Do not render or assemble a timeline.`;

const EXPLAINER_ENTITY_IDS = [
  "lumen-style",
  "support-lead",
  "lumen-dashboard-mock",
  "glass-funnel"
];

const MUSIC_VIDEO_ENTITIES = [
  { id: "neon-style", name: "Neon Style", kind: "style" },
  { id: "nova", name: "Nova", kind: "character" },
  { id: "pool", name: "Drained Pool", kind: "location" },
  { id: "phone", name: "Red Phone", kind: "prop" }
] as const;

const COMMERCIAL_ENTITIES = [
  { id: "warp-style", name: "WARP Style", kind: "style" },
  { id: "runner", name: "Runner", kind: "character" },
  { id: "warp-can", name: "WARP Can", kind: "prop" },
  { id: "studio", name: "Night Studio", kind: "location" }
] as const;

/** Nodes reachable from some input by following edges — the connected core. */
function wiredNodeCount(state: {
  nodes: { id: string }[];
  edges: { source: string; target: string }[];
}): number {
  const wired = new Set<string>();
  for (const edge of state.edges) {
    wired.add(edge.source);
    wired.add(edge.target);
  }
  return wired.size;
}

export const JOBS_TO_BE_DONE: readonly ErasedJob[] = [
  defineJob({
    id: "caption-titles-picture-locked",
    statement: "When my picture is locked, I want one readable, consistent text layer, so I can help the audience follow the cut without missing the action.",
    surfaces: ["timeline"], difficulty: "long-horizon", maxIterations: 16, expectedToolCalls: 14,
    objective: "The open vertical 1080x1920 timeline has three picture clips: Host at 0-5000ms, Demo at 5000-10000ms, and End at 10000-15000ms. Add a consistent text layer: title 'WORK LESS. KNOW MORE.' for at least 2000ms, lower-third 'Maya Chen' for 3000ms after the host appears, caption 'Everything you need, in one place.' with readable duration, and a single CTA 'Try Lumen' at the end. Put scrims behind live-picture text and animate every text clip in and out. Do not render.",
    createBridge: () => createTimelineToolBridge({ width: 1080, height: 1920, tracks: [{ type: "video", name: "Picture" }], clips: [{ name: "Host", trackIndex: 0, startMs: 0, durationMs: 5000 }, { name: "Demo", trackIndex: 0, startMs: 5000, durationMs: 5000 }, { name: "End", trackIndex: 0, startMs: 10000, durationMs: 5000 }] }),
    outcomes: [
      { name: "text-layer", describe: "Titles and captions are on overlay or subtitle tracks.", test: (s) => s.tracks.some((t) => t.type === "overlay") && s.clips.filter((c) => c.mediaType === "text").length >= 4 },
      { name: "readable-animated", describe: "Every text clip stays readable and has entry and exit motion.", test: (s) => s.clips.filter((c) => c.mediaType === "text").every((c) => c.durationMs >= 1200 && c.animations.some((a) => a.role === "in") && c.animations.some((a) => a.role === "out")) }
    ]
  }),

  defineJob({
    id: "motion-title-sequence",
    statement: "When I have picture and a music bed, I want a title sequence that moves with the track, so I can hand over a cut that looks designed instead of typed over.",
    surfaces: ["timeline"], difficulty: "long-horizon", maxIterations: 18, expectedToolCalls: 14,
    objective: "This vertical cut has three shots roughly laid out over a 120 BPM music bed that starts at zero. Open it with a title sequence that lands on the beat, put 'Maya Chen' under the second shot as a lower third, and finish on an end card that says 'SEE YOU THERE'. Keep each title together as one unit I can move later, and have the type move on and off rather than pop in and sit there. Do not render.",
    systemPrompt: `${findSystemSkill("motion-graphics")?.content ?? ""}\nEvaluation adapter: this surface exposes the edits as ui_timeline_* tools — read get_timeline as ui_timeline_get_state and each edit_timeline op as the matching tool. preview_timeline_frame is here and reports the layer stack rather than pixels. There is no rendering and no version history to snapshot.`,
    createBridge: () => createTimelineToolBridge({ preview: true, width: 1080, height: 1920, tracks: [{ type: "video", name: "Picture" }, { type: "audio", name: "Music" }], clips: [{ name: "Shot 1", trackIndex: 0, mediaType: "video", startMs: 0, durationMs: 4180 }, { name: "Shot 2", trackIndex: 0, mediaType: "video", startMs: 4180, durationMs: 5150 }, { name: "Shot 3", trackIndex: 0, mediaType: "video", startMs: 9330, durationMs: 5670 }, { name: "Music", trackIndex: 1, mediaType: "audio", startMs: 0, durationMs: 15000 }] }),
    outcomes: [
      // 120 BPM is a beat every 500ms; 60ms is the tolerance a cut reads as
      // landing on one. Markers are a note to self, so the picture has to sit
      // on the grid; any markers written down have to agree with it.
      { name: "on-the-beat", describe: "Every picture boundary sits on the 120 BPM grid, and so does any marker.", test: (s) => { const onGrid = (ms: number) => Math.abs(ms - Math.round(ms / 500) * 500) <= 60; const picture = s.clips.filter((c) => c.mediaType === "video"); return picture.length > 0 && picture.every((c) => onGrid(c.startMs) && onGrid(c.startMs + c.durationMs)) && s.markers.every((m) => onGrid(m.timeMs)); } },
      // An empty group is a movable thing holding nothing. The title itself
      // has to be inside it, or be part of a composition.
      { name: "titles-are-units", describe: "A title is one movable thing: text inside a group, or a composition.", test: (s) => { const groups = new Set(s.documentClips.filter((c) => c.mediaType === "group").map((c) => c.id)); return s.documentClips.some((c) => c.mediaType === "text" && (Boolean(c.compositionId) || (c.parentId !== undefined && groups.has(c.parentId)))); } },
      { name: "type-moves-and-fits", describe: "Every text clip enters and exits, and a staggered entrance finishes inside its clip.", test: (s) => { const texts = s.documentClips.filter((c) => c.mediaType === "text"); return texts.length >= 2 && texts.every((c) => (c.animations ?? []).some((a) => a.role === "in") && (c.animations ?? []).some((a) => a.role === "out")) && texts.some((c) => (c.animations ?? []).some((a) => a.stagger && staggerUnitsOf(c, a.stagger.unit, { width: s.width, height: s.height }) >= 2)) && texts.every((c) => (c.animations ?? []).every((a) => staggerSpanFitsClip(c, a, { width: s.width, height: s.height }))); } },
      { name: "looked-at-it", describe: "The last edit was followed by a look at the frame.", test: (s) => previewedAfterLastEdit(s.toolLog) }
    ]
  }),

  defineJob({
    id: "commercial-beat-sheet-from-brief",
    statement: "When I have a product brief, I want a timed commercial board with consistent product references, so I can approve the spot before production.",
    surfaces: ["storyboard"], difficulty: "long-horizon", maxIterations: 16, expectedToolCalls: 10,
    objective: "Create a 30-second vertical commercial for WARP energy drink. Brand: electric, direct, nocturnal. Audience: late-night creators. Core pain: fading focus at midnight. USP: [CLIENT INPUT NEEDED]. CTA: Try WARP. Use Runner, WARP Can, Night Studio, and WARP Style. Plan hook, brand landing, problem, solution, proof, CTA, reiteration, closing. No rendering.",
    systemPrompt: `${findSystemSkill("commercial-beat-sheet")?.content ?? ""}\nEvaluation adapter: the roster is already approved. Do not stop after list_entities: in this same turn create a board, attach all ids with set_board, and add exact ordered 8 beats: hook, brand-landing, problem, solution, proof, cta, reiteration, closing. Total 30 seconds. Every action names [WARP Style], proof uses [CLIENT INPUT NEEDED], and hook does not name WARP Can.`,
    createBridge: () => createExplainerStoryboardToolBridge(COMMERCIAL_ENTITIES),
    outcomes: [
      { name: "timed-arc", describe: "Eight ordered beats total 30 seconds.", test: (s) => s.shots.map((x) => x.slug).join(",") === "hook,brand-landing,problem,solution,proof,cta,reiteration,closing" && s.shots.reduce((n, x) => n + x.durationSeconds, 0) === 30 },
      { name: "truthful-consistent", describe: "The product roster is persisted, style holds, and unknown proof is marked.", test: (s) => s.entityIds.length === 4 && s.shots.every((x) => x.action.includes("[WARP Style]")) && s.shots.some((x) => x.action.includes("[CLIENT INPUT NEEDED]")) && !s.shots[0]?.action.includes("[WARP Can]") && s.savable }
    ]
  }),

  defineJob({
    id: "music-video-treatment-from-track",
    statement: "When I have a mapped track, I want a beat-synced treatment with consistent artist references, so I can plan a shoot that cuts to the music.",
    surfaces: ["storyboard"], difficulty: "long-horizon",
    objective: "Create a planned music-video board for Nova's synthpop track Neon Tide. BPM 120, 4/4, 0:32. Section map: intro 0:00-0:08, verse 0:08-0:16, chorus 0:16-0:24, outro 0:24-0:32. Performance/narrative ratio 60/40. Use the artist Nova, Drained Pool, Red Phone, and Neon Style. The chorus downbeat is the biggest event. There are no confirmed release facts or lyrics, so use [ARTIST INPUT NEEDED] where needed. Do not render.",
    maxIterations: 14, expectedToolCalls: 8,
    systemPrompt: `${findSystemSkill("music-video-treatment")?.content ?? ""}\nEvaluation adapter: list and reuse existing entities, create a board, attach all entity ids with set_board, then add exactly intro, verse, chorus, outro in order. Each is 8 seconds (four bars at 120 BPM in 4/4); every action names [Neon Style], chorus names [Nova] and its downbeat event, and outro echoes intro.`,
    createBridge: () => createExplainerStoryboardToolBridge(MUSIC_VIDEO_ENTITIES),
    outcomes: [
      { name: "bar-grid", describe: "Four four-bar sections total 32 seconds.", test: (s) => s.shots.map((x) => x.slug).join(",") === "intro,verse,chorus,outro" && s.shots.every((x) => x.durationSeconds === 8) },
      { name: "artist-and-hook", describe: "The artist sells the chorus hook on its downbeat.", test: (s) => Boolean(s.shots.find((x) => x.slug === "chorus")?.action.includes("[Nova]") && s.shots.find((x) => x.slug === "chorus")?.action.toLowerCase().includes("downbeat")) },
      { name: "consistent-roster", describe: "The board persists all production entities and applies the style to every section.", test: (s) => s.entityIds.length === 4 && s.shots.every((x) => x.action.includes("[Neon Style]")) && s.savable }
    ]
  }),

  defineJob({
    id: "workflow-from-prompt",
    statement:
      "When I describe a text transformation in a sentence, I want a runnable workflow built for me, so I can use it without learning the node catalog.",
    surfaces: ["workflow-authoring"],
    difficulty: "smoke",
    objective:
      "I need a workflow that takes a person's name as input and gives me back a greeting for them. Build it for me.",
    expectedToolCalls: 8,
    createBridge: graphWorld,
    outcomes: [
      {
        name: "has-input",
        describe: "The workflow takes a value in.",
        test: (s) => s.nodes.some((n) => n.type.startsWith("nodetool.input."))
      },
      {
        name: "has-output",
        describe: "The workflow surfaces a result.",
        test: (s) => s.nodes.some((n) => n.type.startsWith("nodetool.output."))
      },
      {
        name: "connected",
        describe: "Input and output are actually wired together.",
        test: (s) => s.edges.length > 0 && wiredNodeCount(s) >= 2
      }
    ]
  }),

  defineJob({
    id: "workflow-with-llm-step",
    statement:
      "When a transformation needs judgement rather than string handling, I want the workflow to call a model, so I can automate work that has no formula.",
    surfaces: ["workflow-authoring"],
    difficulty: "standard",
    objective:
      "Build me a workflow that takes a customer complaint as input, has an LLM write a polite reply to it, and returns that reply.",
    expectedToolCalls: 10,
    createBridge: graphWorld,
    outcomes: [
      {
        name: "uses-agent",
        describe: "An LLM step does the writing.",
        test: (s) => s.nodes.some((n) => n.type.startsWith("nodetool.agents."))
      },
      {
        name: "end-to-end",
        describe: "Input, the LLM step and output are one connected chain.",
        test: (s) =>
          s.nodes.some((n) => n.type.startsWith("nodetool.input.")) &&
          s.nodes.some((n) => n.type.startsWith("nodetool.output.")) &&
          wiredNodeCount(s) >= 3
      }
    ]
  }),

  defineJob({
    id: "script-cast-and-voice",
    statement:
      "When I have a scene in my head, I want it written down with the right speakers attached, so I can hear it read back.",
    surfaces: ["script"],
    difficulty: "standard",
    objective:
      "Write me a short two-hander: a nervous intern and a tired manager, four lines between them, at the coffee machine. Give each character their own voice.",
    expectedToolCalls: 12,
    createBridge: () => createScriptToolBridge(),
    outcomes: [
      {
        name: "two-speakers",
        describe: "Both characters exist in the cast.",
        test: (s) => s.cast.length >= 2
      },
      {
        name: "lines-written",
        describe: "There are at least four lines.",
        test: (s) => s.lines.length >= 4
      },
      {
        name: "lines-attributed",
        describe: "Every line belongs to a speaker.",
        test: (s) =>
          s.lines.length > 0 && s.lines.every((l) => l.speakerId !== null)
      },
      {
        name: "voices-assigned",
        describe: "Each character has a voice, so the script can be read back.",
        test: (s) => s.cast.every((c) => c.hasVoice)
      }
    ]
  }),

  defineJob({
    id: "storyboard-a-scene",
    statement:
      "When I have a scene to shoot, I want it broken into shots with the action described, so I can see the coverage before I spend on renders.",
    surfaces: ["storyboard"],
    difficulty: "standard",
    objective:
      "Board this for me: a courier bikes through rain to deliver a package, and the person opening the door is not who they expected. Five shots, each with the action written out and a length on it.",
    expectedToolCalls: 14,
    createBridge: () => createStoryboardToolBridge(),
    outcomes: [
      {
        name: "five-shots",
        describe: "The board has five shots.",
        test: (s) => s.shots.length >= 5
      },
      {
        name: "action-written",
        describe: "Every shot says what happens in it.",
        test: (s) =>
          s.shots.length > 0 && s.shots.every((shot) => shot.action.trim() !== "")
      },
      {
        name: "savable",
        describe: "The board would survive a save — it is a real document.",
        test: (s) => s.savable
      }
    ]
  }),

  defineJob({
    id: "explainer-storyboard-from-brief",
    statement:
      "When I have a confirmed product brief, I want a truthful, shootable explainer board with consistent visual references, so I can teach the product before spending on renders.",
    surfaces: ["storyboard"],
    difficulty: "long-horizon",
    objective:
      "Create a 60-second shootable explainer storyboard for Lumen, a SaaS product for support leads. Brand traits: calm, precise, practical. Audience: non-technical support leads. Core problem: agents hunt through scattered customer context before answering. The shift: every case arrives with its relevant history in one place. How it works: connect the helpdesk, retrieve the customer's prior conversations, then draft a reply for human review. CTA: Start a Lumen trial. Platform: landing page. Tone: confident and plain. Use a clean soft-3D style, a Lumen dashboard mock, and one translucent glass funnel as the single metaphor. There are no confirmed metrics, integrations beyond the helpdesk, customer claims, or real screenshots. Plan the problem, stakes, shift, two mechanism beats, outcome/proof, CTA, and sign-off. Make every shot's action name the visible entities in brackets, include the style entity in every shot, make UI mechanism shots explicitly labelled mock, and use [CLIENT INPUT NEEDED] for proof. Do not render or assemble a timeline.",
    expectedToolCalls: 14,
    maxIterations: 18,
    systemPrompt: EXPLAINER_STORYBOARD_PROMPT,
    createBridge: () => createExplainerStoryboardToolBridge(),
    outcomes: [
      {
        name: "teaching-arc",
        describe: "The board covers the problem, shift, two mechanism steps, proof, CTA, and sign-off.",
        test: (s) => {
          return s.shots.length === 8 && s.shots.map((shot) => shot.slug).join(",") === [
            "problem",
            "stakes",
            "shift",
            "mechanism-1",
            "mechanism-2",
            "outcome-proof",
            "cta",
            "sign-off"
          ].join(",");
        }
      },
      {
        name: "runtime-budget",
        describe: "The planned beats total exactly 60 seconds.",
        test: (s) =>
          s.shots.length >= 7 &&
          s.shots.every((shot) => typeof shot.durationSeconds === "number") &&
          s.shots.reduce((total, shot) => total + (shot.durationSeconds ?? 0), 0) === 60
      },
      {
        name: "entity-consistency",
        describe: "Every shot names its visual references, including the shared style.",
        test: (s) =>
          s.entityIds.length === 4 &&
          EXPLAINER_ENTITY_IDS.every((id) => s.entityIds.includes(id)) &&
          s.shots.every((shot) => shot.action.includes("[Lumen Style]")) &&
          ["Support Lead", "Lumen Dashboard Mock", "Glass Funnel"].every((name) =>
            s.shots.some((shot) => shot.action.includes(`[${name}]`))
          ) &&
          s.shots.filter((shot) => shot.slug.startsWith("mechanism-")).every((shot) => shot.action.toLowerCase().includes("mock"))
      },
      {
        name: "truthful-proof",
        describe: "Unconfirmed proof remains marked for client input.",
        test: (s) => s.shots.some((shot) => shot.action.includes("[CLIENT INPUT NEEDED]"))
      },
      {
        name: "savable",
        describe: "The board would survive a save as a real document.",
        test: (s) => s.created && s.savable
      }
    ]
  }),

  defineJob({
    id: "timeline-assemble-cut",
    statement:
      "When I have footage and a music bed, I want them laid out on separate tracks in the right order, so I can watch a rough cut.",
    surfaces: ["timeline"],
    difficulty: "standard",
    objective:
      "Put together a rough cut for me: three video shots back to back with no gaps, and a music track running underneath the whole thing.",
    expectedToolCalls: 14,
    createBridge: () => createTimelineToolBridge(),
    outcomes: [
      {
        name: "separate-tracks",
        describe: "Picture and music are on their own tracks.",
        test: (s) =>
          s.tracks.some((t) => t.type === "video") &&
          s.tracks.some((t) => t.type === "audio")
      },
      {
        name: "three-shots",
        describe: "Three picture clips are on the timeline.",
        test: (s) => {
          const video = new Set(
            s.tracks.filter((t) => t.type === "video").map((t) => t.id)
          );
          return s.clips.filter((c) => video.has(c.trackId)).length >= 3;
        }
      },
      {
        name: "no-gaps",
        describe: "The picture clips run back to back, with no black between.",
        test: (s) => {
          const video = new Set(
            s.tracks.filter((t) => t.type === "video").map((t) => t.id)
          );
          const shots = s.clips
            .filter((c) => video.has(c.trackId))
            .sort((a, b) => a.startMs - b.startMs);
          return shots.every((clip, i) => {
            if (i === 0) return true;
            const prev = shots[i - 1];
            if (prev === undefined) return false;
            return clip.startMs <= prev.startMs + prev.durationMs;
          });
        }
      }
    ]
  }),

  defineJob({
    id: "sketch-layered-artwork",
    statement:
      "When I want a piece of artwork I can revise later, I want it drawn on separate layers, so I can change the background without repainting the subject.",
    surfaces: ["sketch"],
    difficulty: "standard",
    objective:
      "Draw me a simple landscape — sky, hills, and a sun. Keep each part on its own layer so I can adjust them separately afterwards, and name the layers for what they hold.",
    maxIterations: 20,
    expectedToolCalls: 20,
    createBridge: () => createSketchToolBridge(),
    outcomes: [
      {
        name: "layered",
        describe: "The artwork is on three or more named layers.",
        test: (s) => s.layers.length >= 3
      },
      {
        name: "named-layers",
        describe: "The layers are named for what they hold.",
        test: (s) =>
          s.layers.length > 0 &&
          s.layers.every((l) => l.name.trim() !== "" && !/^Layer \d+$/.test(l.name))
      },
      {
        name: "actually-drawn",
        describe: "Something was painted, not just set up.",
        test: (s) => s.strokedFraction > 0
      }
    ]
  }),

  defineJob({
    id: "model3d-compose-scene",
    statement:
      "When I need a placeholder set for a shot, I want primitives arranged and lit, so I can block the camera before anyone models anything.",
    surfaces: ["model3d"],
    difficulty: "standard",
    objective:
      "Block out a simple scene for me: a table with two objects sitting on top of it, and a light so the shot is not black. Name things for what they are.",
    expectedToolCalls: 12,
    createBridge: () => createModel3DToolBridge(),
    outcomes: [
      {
        name: "has-objects",
        describe: "There is a table and two things on it.",
        test: (s) =>
          s.objects.filter((o) => !o.type.toLowerCase().includes("light"))
            .length >= 3
      },
      {
        name: "has-light",
        describe: "The scene is lit.",
        test: (s) =>
          s.objects.some((o) => o.type.toLowerCase().includes("light"))
      },
      {
        name: "stacked",
        describe: "The objects sit above the table rather than inside it.",
        test: (s) => {
          const solids = s.objects.filter(
            (o) => !o.type.toLowerCase().includes("light")
          );
          const heights = solids.map((o) => o.position[1]);
          return new Set(heights).size >= 2;
        }
      }
    ]
  }),

  defineJob({
    id: "jsscript-write-and-test",
    statement:
      "When I have a data-shaping step no node covers, I want a script written and proved against examples, so I can trust it in a workflow.",
    surfaces: ["jsscript"],
    difficulty: "standard",
    objective:
      "Write me a script that takes a list of numbers and gives back a running total. Save some test cases with it so I can see it works.",
    expectedToolCalls: 12,
    createBridge: () => createJsScriptToolBridge(),
    outcomes: [
      {
        name: "declares-ports",
        describe: "The script takes something in and gives something back.",
        test: (s) => s.inputs.length >= 1 && s.outputs.length >= 1
      },
      {
        name: "valid",
        describe: "The script passes the static check.",
        test: (s) => s.valid
      },
      {
        name: "tested",
        describe: "It carries test cases proving it works.",
        test: (s) => s.tests.length >= 1
      }
    ]
  }),

  defineJob({
    id: "script-to-storyboard-handoff",
    statement:
      "When a script is written, I want a board derived from it that still points back at the lines, so I can shoot it without retyping the scene.",
    surfaces: ["script", "storyboard"],
    difficulty: "long-horizon",
    objective:
      "Here is what I need: write a short scene of four lines between two characters, then turn it into a storyboard where each shot covers the lines it is showing.",
    maxIterations: 24,
    expectedToolCalls: 22,
    createBridge: () => createScriptToolBridge(),
    outcomes: [
      {
        name: "scene-written",
        describe: "The scene exists with four attributed lines.",
        test: (s) =>
          s.lines.length >= 4 && s.lines.every((l) => l.speakerId !== null)
      },
      {
        name: "board-derived",
        describe: "A storyboard was derived from that script.",
        test: (s) => s.storyboardId !== null && s.derivedShots.length > 0
      },
      {
        name: "linkage-kept",
        describe:
          "The shots still say which lines they cover — the handoff kept the link.",
        test: (s) =>
          s.derivedShots.length > 0 &&
          s.derivedShots.some((shot) => shot.scriptLineIds.length > 0)
      }
    ]
  })
];

/** Look one up by id. */
export function findJob(id: string): ErasedJob | undefined {
  return JOBS_TO_BE_DONE.find((job) => job.id === id);
}
