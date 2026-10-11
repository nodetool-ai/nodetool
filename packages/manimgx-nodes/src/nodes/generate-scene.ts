/**
 * `nodetool.manimgx.GenerateScene` — a prompt → a ManimGX scene → video.
 *
 * A language model writes the scene; `manimgx inspect` checks it; the
 * traceback or the layout report (and, by default, the storyboard pictures)
 * go back to the model until the scene runs clean or the attempts run out.
 * Then `manimgx render` makes the video. The code comes out with the video,
 * so a person or a RenderScene node can take it from there.
 *
 * Layout problems are advisory: a scene that still has some after the last
 * attempt renders anyway, with them in `report`. A scene that never runs
 * throws its last traceback.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { meterProviderSpend } from "@nodetool-ai/llm-nodes/nodes/provider-spend";
import type { LanguageModel } from "@nodetool-ai/protocol";
import {
  messageText,
  type Message,
  type MessageContent,
  type ProcessingContext
} from "@nodetool-ai/runtime";

import {
  ManimgxError,
  runManimgx,
  type ManimgxResult,
  type ManimgxScene
} from "../run-manimgx.js";
import {
  imageOutput,
  runNodeStep,
  videoOutput,
  type ImageOutput,
  type VideoOutput
} from "./scene-base.js";

const NODE_NAME = "nodetool.manimgx.GenerateScene";

/** Tokens one scene may take. Long films run a few hundred lines. */
const MAX_SCENE_TOKENS = 12000;

/** Storyboard sheets sent back per attempt: each holds up to six frames. */
const MAX_FEEDBACK_SHEETS = 2;

export const SCENE_AUTHOR_SYSTEM_PROMPT = `You write ManimGX scenes. ManimGX is a Rust GPU animation engine with Manim Community Edition's Python API.

Write one Python module:
- \`import manimgx as m\`, then exactly one class deriving m.Scene (or m.ThreeDScene for a 3D camera) with \`def construct(self) -> None\`.
- Time advances only through self.play(...) and self.wait(...). self.add(...) adds without animating.
- Place with VGroup, arrange, next_to, to_edge and center so labels follow their subjects. The frame is about 14.2 units wide and 8 tall, centred on the origin; keep everything inside it.
- Text for prose, MathTex(r"...") with raw strings for LaTeX mathematics. No LaTeX installation is needed.
- For changing values, animate a ValueTracker and derive geometry from it with always_redraw or updaters. Updaters use elapsed time or state, never frame counts.
- For 3D: m.ThreeDScene, self.set_camera_orientation(phi=..., theta=...), Surface, Sphere, Cube, ThreeDAxes, self.begin_ambient_camera_rotation(rate=...).
- Values from the workflow are \`from nodetool_inputs import inputs\` (a dict). Media inputs are file paths: m.ImageMobject(path) for images, self.add_sound(path) for audio.
- Read no other files and touch no network: the scene runs headless.

Reply with the complete module in a single \`\`\`python code block, nothing after it. When told about an error or layout problems, reply with the whole corrected module.`;

/** The longest fenced Python block, or the whole reply when it is bare code. */
export function extractSceneCode(reply: string): string {
  const blocks = [...reply.matchAll(/```(?:python|py)?[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
  if (blocks.length > 0) {
    return blocks.reduce((a, b) => (b.length > a.length ? b : a)).trim();
  }
  return /\bimport manimgx\b/.test(reply) ? reply.trim() : "";
}

function describeInputs(inputs: Record<string, unknown>): string {
  const names = Object.keys(inputs);
  if (names.length === 0) return "";
  const lines = names.map((name) => {
    const value = inputs[name];
    const kind =
      value && typeof value === "object" && "type" in value
        ? `${String((value as { type: unknown }).type)} file path`
        : JSON.stringify(value)?.slice(0, 200) ?? "null";
    return `- inputs[${JSON.stringify(name)}]: ${kind}`;
  });
  return `\n\nThe scene can read these values:\n${lines.join("\n")}`;
}

function feedbackMessage(result: ManimgxResult, sendStoryboard: boolean): Message {
  if (!result.ok) {
    return {
      role: "user",
      content: `The scene failed:\n\n${result.report}\n\nFix it and reply with the whole module.`
    };
  }
  const text =
    `The scene runs, but inspection found layout problems:\n\n${result.report}\n\n` +
    "Fix them (the storyboard numbers each one) and reply with the whole module.";
  if (!sendStoryboard || result.storyboards.length === 0) {
    return { role: "user", content: text };
  }
  const content: MessageContent[] = [{ type: "text", text }];
  for (const sheet of result.storyboards.slice(0, MAX_FEEDBACK_SHEETS)) {
    content.push({ type: "image_url", image: { data: sheet, mimeType: "image/png" } });
  }
  return { role: "user", content };
}

type GenerateSceneOutputs = {
  video: VideoOutput;
  code: string;
  storyboard: ImageOutput[];
  report: string;
  attempts: number;
};

export class GenerateSceneNode extends BaseNode {
  static readonly nodeType = "nodetool.manimgx.GenerateScene";
  static readonly title = "Generate ManimGX Scene";
  static readonly description =
    "Describe a math or 3D animation and get a video: a language model writes a ManimGX scene, ManimGX inspects it, and the model fixes errors and layout problems from the report and storyboard before the final render.\n    manim, manimgx, animation, math, explainer, generate, llm, agent, 3d, video, python\n\n    Use cases:\n    - Explain a formula, theorem or algorithm as a short animation\n    - Make a 3D visualization from a sentence\n    - Draft a scene to refine in a RenderScene node";
  static readonly metadataOutputTypes = {
    video: "video",
    code: "str",
    storyboard: "list[image]",
    report: "str",
    attempts: "int"
  };
  static readonly inputFields = ["prompt"];
  static readonly supportsDynamicInputs = true;

  @prop({
    type: "language_model",
    default: { type: "language_model", provider: "empty", id: "", name: "", path: null, supported_tasks: [] },
    title: "Model",
    description: "Model that writes the scene. A vision model also reads the storyboard."
  })
  declare model: LanguageModel;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "What to animate. Wired dynamic inputs reach the scene as `inputs`."
  })
  declare prompt: string;

  @prop({ type: "int", default: 3, title: "Max Attempts", description: "Write-and-inspect rounds before rendering", min: 1, max: 8 })
  declare max_attempts: number;

  @prop({
    type: "bool",
    default: true,
    title: "Send Storyboard",
    description: "Show the model the storyboard pictures with layout problems (needs a vision model)"
  })
  declare send_storyboard: boolean;

  @prop({ type: "int", default: 1920, title: "Width", description: "Video width in pixels", min: 16, max: 7680 })
  declare width: number;

  @prop({ type: "int", default: 1080, title: "Height", description: "Video height in pixels", min: 16, max: 4320 })
  declare height: number;

  @prop({ type: "int", default: 30, title: "FPS", description: "Frames per second", min: 1, max: 120 })
  declare fps: number;

  @prop({ type: "int", default: 300, title: "Timeout", description: "Maximum seconds for each ManimGX run", min: 1, max: 3600 })
  declare timeout: number;

  async process(context?: ProcessingContext): Promise<GenerateSceneOutputs> {
    if (!context) throw new Error(`${NODE_NAME} requires a processing context`);
    const prompt = this.prompt?.trim() ?? "";
    if (!prompt) throw new Error(`${NODE_NAME}: prompt is empty — describe the animation`);
    const providerId = this.model?.provider ?? "";
    const modelId = this.model?.id ?? "";
    if (!providerId || providerId === "empty" || !modelId) {
      throw new Error(`${NODE_NAME}: pick a model — the scene needs a writer`);
    }
    const inputs = Object.fromEntries(
      [...this.dynamicProps.entries()].filter(([name]) => !name.startsWith("_"))
    );
    const timeoutMs = Math.max(1, Math.round(Number(this.timeout ?? 300))) * 1000;
    const maxAttempts = Math.min(8, Math.max(1, Math.round(Number(this.max_attempts ?? 3))));
    const signal = context.signal;

    return runNodeStep(NODE_NAME, signal, async () => {
      const provider = await context.getProvider(providerId);
      const spend = meterProviderSpend(context, provider, modelId);
      try {
        const messages: Message[] = [
          { role: "system", content: SCENE_AUTHOR_SYSTEM_PROMPT },
          { role: "user", content: `${prompt}${describeInputs(inputs)}` }
        ];
        let scene: ManimgxScene | null = null;
        let inspected: ManimgxResult | null = null;
        let attempts = 0;
        while (attempts < maxAttempts) {
          signal?.throwIfAborted();
          attempts += 1;
          const reply = await provider.generateMessage({
            messages: [...messages],
            model: modelId,
            maxTokens: MAX_SCENE_TOKENS
          });
          const text = messageText(reply.content);
          messages.push({ role: "assistant", content: text });
          const code = extractSceneCode(text);
          if (!code) {
            messages.push({
              role: "user",
              content: "Reply with the complete scene module in a single ```python code block."
            });
            continue;
          }
          scene = { code, inputs };
          inspected = await runManimgx(context, scene, { command: "inspect" }, { timeoutMs, signal });
          context.postMessage?.({
            type: "log_update",
            node_id: this.__node_id,
            node_name: NODE_NAME,
            content: `Attempt ${attempts}: ${inspected.ok ? (inspected.problems ? "layout problems" : "clean") : "scene failed"}`,
            severity: inspected.ok ? "info" : "warning"
          });
          if (inspected.ok && !inspected.problems) break;
          messages.push(feedbackMessage(inspected, this.send_storyboard !== false));
        }
        if (!scene || !inspected) {
          throw new ManimgxError(`the model wrote no scene code in ${attempts} attempts`);
        }
        if (!inspected.ok) {
          throw new ManimgxError(`the scene still fails after ${attempts} attempts:\n${inspected.report}`);
        }
        const rendered = await runManimgx(
          context,
          scene,
          {
            command: "render",
            settings: {
              width: Number(this.width ?? 1920),
              height: Number(this.height ?? 1080),
              fps: Number(this.fps ?? 30),
              preset: "medium",
              crf: 23
            }
          },
          { timeoutMs, signal }
        );
        if (!rendered.ok || !rendered.video) {
          throw new ManimgxError(`the scene failed to render:\n${rendered.report}`);
        }
        return {
          video: videoOutput(rendered.video),
          code: scene.code,
          storyboard: rendered.storyboards.map(imageOutput),
          report: rendered.report,
          attempts
        };
      } finally {
        spend.report();
      }
    });
  }
}

export const MANIMGX_GENERATE_NODES = [GenerateSceneNode] as const;
