import type { Competitor } from "./competitorEntries";

/**
 * Hero copy and product visuals for the `/alternatives/<slug>` template, chosen
 * by the competitor's category. Every visual is a NodeTool capture or a reel
 * rendered by the demo harness from product surfaces; none shows the other
 * product. A competitor record can override the hero copy with `hero`.
 */

/** A still or a looping clip. A clip is `<base>.webm`, `<base>.mp4`, and `<base>-poster.webp` in `public/`. */
export type AlternativeMedia =
  | { kind: "image"; src: string; width: number; height: number; alt: string }
  | { kind: "clip"; base: string; alt: string };

export type AlternativeStage = {
  label: string;
  title: string;
  body: string;
  media: AlternativeMedia;
};

export type AlternativeVisualSet = {
  headline: string;
  subline: string;
  stagesHeading: string;
  stagesIntro: string;
  stages: [AlternativeStage, AlternativeStage, AlternativeStage];
};

/** Every page's hero plays the landing page reel (`public/hero-flow.*`). */
export const HERO_REEL = {
  base: "/hero-flow",
  alt: "NodeTool: one sentence becomes a beat sheet, entities, a storyboard of stills and clips, and a finished cut",
  caption: "One sentence becomes a short film. The agent outlines the story, designs the characters, draws a storyboard, generates the clips, and edits them together.",
};

const NODES_CLIP: AlternativeMedia = {
  kind: "clip",
  base: "/surface-nodes",
  alt: "The node editor runs a shot workflow: entity images feed Text To Image, then Image To Video, then a timeline clip",
};
const STORYBOARD_CLIP: AlternativeMedia = {
  kind: "clip",
  base: "/surface-storyboard",
  alt: "The storyboard editor with five shots, each with its still, clip, and cast",
};
const TIMELINE_CLIP: AlternativeMedia = {
  kind: "clip",
  base: "/surface-timeline",
  alt: "The multi-track timeline: the agent tightens the opening and the shots ripple on the video track",
};
const SKETCH_CLIP: AlternativeMedia = {
  kind: "clip",
  base: "/surface-sketch",
  alt: "The sketch editor regenerates one layer of a poster while the other layers stay unchanged",
};
const WORKFLOW_SHOT: AlternativeMedia = {
  kind: "image",
  src: "/screen_workflow.webp",
  width: 1600,
  height: 1019,
  alt: "A NodeTool workflow: text inputs and a product image feed an Agent node that writes the video prompt for Image To Video",
};

const FILM_STAGES: AlternativeVisualSet["stages"] = [
  {
    label: "1. Build",
    title: "Agent and node graph",
    body: "Describe the film. The agent writes the workflow, and every step stays visible in the node editor.",
    media: NODES_CLIP,
  },
  {
    label: "2. Generate",
    title: "Shots and takes",
    body: "Stills settle the look on the storyboard. Only the shots you approve become video.",
    media: STORYBOARD_CLIP,
  },
  {
    label: "3. Finish",
    title: "An editable cut",
    body: "Arrange, trim, and layer clips on the timeline, or ask the agent to tighten the opening.",
    media: TIMELINE_CLIP,
  },
];

const AUTOMATION_STAGES: AlternativeVisualSet["stages"] = [
  {
    label: "1. Build",
    title: "Agents on the canvas",
    body: "Agents, document search, and generation nodes share one graph. An agent can build it from a description.",
    media: WORKFLOW_SHOT,
  },
  {
    label: "2. Run",
    title: "Watch every step",
    body: "Each node shows its output as the workflow runs, so a failed step is easy to find and fix.",
    media: NODES_CLIP,
  },
  {
    label: "3. Share",
    title: "A mini app on top",
    body: "Give a workflow inputs and a Run button, so other people can use it without opening the graph.",
    media: {
      kind: "image",
      src: "/screen_app_builder.png",
      width: 1440,
      height: 900,
      alt: "The mini app builder: input blocks on the left, the app preview with a Run button, and page settings",
    },
  },
];

const VISUALS: Record<string, AlternativeVisualSet> = {
  "Node editor": {
    headline: "Beyond the node graph.",
    subline: "Create with AI agents, refine with visual editors, and finish in an editable production workspace.",
    stagesHeading: "From node graph to finished project",
    stagesIntro: "The workflow canvas is one editor of several. The storyboard and timeline work on the same project.",
    stages: FILM_STAGES,
  },
  "AI filmmaking": {
    headline: "From brief to editable cut.",
    subline: "An agent plans the storyboard and renders the shots. You keep the workflow, the storyboard, and the timeline, and can change any of them.",
    stagesHeading: "From brief to finished film, in one project",
    stagesIntro: "Each stage has its own editor, and the agent works in the same editors you do.",
    stages: FILM_STAGES,
  },
  "Video studio": {
    headline: "Every shot stays editable.",
    subline: "Generate with the video model you choose, then arrange, trim, and re-render single shots on a multi-track timeline in the same project.",
    stagesHeading: "From generation to a cut you can change",
    stagesIntro: "Each stage has its own editor, and the agent works in the same editors you do.",
    stages: FILM_STAGES,
  },
  "Creative canvas": {
    headline: "Keep the prompt, the layers, and the workflow.",
    subline: "Generate with models from the providers you connect, repaint one layer without touching the others, and rerun the workflow behind every image.",
    stagesHeading: "From prompt to finished asset",
    stagesIntro: "The image is not the end of the project. The workflow and the layers behind it stay editable.",
    stages: [
      {
        label: "1. Build",
        title: "A workflow behind the image",
        body: "Prompts, reference images, and models are connected nodes, so a result can be traced and rerun.",
        media: NODES_CLIP,
      },
      {
        label: "2. Refine",
        title: "Layer by layer",
        body: "Give one layer a description and only that layer is redrawn. Your own drawing stays as it was.",
        media: SKETCH_CLIP,
      },
      {
        label: "3. Continue",
        title: "Into storyboard and video",
        body: "The same project has a storyboard, where approved stills become video clips.",
        media: STORYBOARD_CLIP,
      },
    ],
  },
  "Workflow automation": {
    headline: "Automation that makes media.",
    subline: "Agents, document search, and native image, video, and music generation nodes on one canvas. Describe the pipeline and an agent builds and runs it.",
    stagesHeading: "From description to running workflow",
    stagesIntro: "The agent builds a graph you can read, run, and change by hand.",
    stages: AUTOMATION_STAGES,
  },
  "Chatbot & agent builder": {
    headline: "Agents with a creative canvas.",
    subline: "Chat, document search, and agents on the same canvas as native image, video, and music generation.",
    stagesHeading: "From description to running workflow",
    stagesIntro: "The agent builds a graph you can read, run, and change by hand.",
    stages: AUTOMATION_STAGES,
  },
  "Agent automation": {
    headline: "Agents you can open and inspect.",
    subline: "Describe the job and an agent builds a workflow you can see, run step by step, and edit.",
    stagesHeading: "From description to running workflow",
    stagesIntro: "The agent builds a graph you can read, run, and change by hand.",
    stages: AUTOMATION_STAGES,
  },
  "Local language model runtime": {
    headline: "Local models, beyond chat.",
    subline: "Run models through Ollama, MLX, or llama.cpp, then use them in agents, document search, and image, video, and music workflows.",
    stagesHeading: "From a local model to a workflow",
    stagesIntro: "Chat is one way in. The same models can run inside agents and multi-step workflows.",
    stages: [
      {
        label: "1. Chat",
        title: "Chat with any connected model",
        body: "Pick a local or hosted model and chat. Generated media stays in the conversation.",
        media: {
          kind: "image",
          src: "/screen_chat.webp",
          width: 1600,
          height: 1103,
          alt: "NodeTool chat with a generated image of a rocket launch and the model picker",
        },
      },
      {
        label: "2. Models",
        title: "Local models in one place",
        body: "Browse, download, and manage local models, and see which nodes each model works with.",
        media: {
          kind: "image",
          src: "/screen_model_manager.webp",
          width: 1600,
          height: 1089,
          alt: "The Model Manager listing installed local speech recognition models by category",
        },
      },
      {
        label: "3. Workflows",
        title: "Models inside workflows",
        body: "Wire a model into a graph with agents, document search, and generation nodes.",
        media: WORKFLOW_SHOT,
      },
    ],
  },
};

export function alternativeVisuals(c: Competitor): AlternativeVisualSet {
  const set = VISUALS[c.category] ?? VISUALS["AI filmmaking"];
  return c.hero ? { ...set, ...c.hero } : set;
}
