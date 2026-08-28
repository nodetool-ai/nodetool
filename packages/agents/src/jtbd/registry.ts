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
import { createStoryboardToolBridge } from "../evals/surfaces/storyboard.js";
import { createTimelineToolBridge } from "../evals/surfaces/timeline.js";
import { defineJob, type ErasedJob } from "./run.js";

const graphWorld = () =>
  createToolLoopBridge({ nodeMetadata: TOOL_LOOP_NODE_CATALOG });

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
