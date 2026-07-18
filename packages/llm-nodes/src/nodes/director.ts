/**
 * @nodetool-ai/llm-nodes — Direction layer nodes.
 *
 * The Director agent turns a brief into a typed {@link Screenplay}; the
 * Screenplay Shots node fans it out into one image-generation prompt per shot;
 * the Apply Entities node injects reusable entity descriptors into a prompt for
 * cross-shot consistency. The pure helpers (parseScreenplay, composeShotPrompt,
 * injectEntities) carry the logic so they can be unit-tested without a provider.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type {
  CameraDirection,
  InputMode,
  LanguageModel,
  OutputCorrelation,
  Screenplay,
  Shot
} from "@nodetool-ai/protocol";
import { isEntity } from "@nodetool-ai/protocol";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

import { asText, generateStructured, getModelConfig } from "./agent-utils.js";

const EMPTY_MODEL = {
  type: "language_model",
  provider: "empty",
  id: "",
  name: "",
  path: null,
  supported_tasks: []
};

const DIRECTOR_SYSTEM_PROMPT = [
  "You are a film director. Turn the user's brief into a structured screenplay.",
  "Produce a coherent visual story broken into distinct shots, each with a",
  "concrete visual action and camera direction. Apply one consistent style",
  "across every shot. Call the screenplay tool exactly once with the result."
].join(" ");

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; no context / network dependency)
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalStr(value: unknown): string | undefined {
  const s = str(value).trim();
  return s.length > 0 ? s : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Strip a leading/trailing ```json … ``` fence, if present. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

/** Coerce a parsed object, a JSON string, or a fenced JSON block to a record. */
function coerceObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(stripFences(raw));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not valid JSON — fall through to an empty record.
    }
  }
  return {};
}

function coerceCamera(raw: unknown): CameraDirection | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const camera: CameraDirection = {};
  const framing = optionalStr(obj.framing);
  const lens = optionalStr(obj.lens);
  const angle = optionalStr(obj.angle);
  const movement = optionalStr(obj.movement);
  if (framing) camera.framing = framing;
  if (lens) camera.lens = lens;
  if (angle) camera.angle = angle;
  if (movement) camera.movement = movement;
  return Object.keys(camera).length > 0 ? camera : undefined;
}

function coerceShot(raw: unknown, index: number): Shot {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const shot: Shot = {
    type: "shot",
    id: `shot-${index}`,
    index,
    action: str(obj.action),
    status: "planned"
  };
  const slug = optionalStr(obj.slug);
  if (slug) shot.slug = slug;
  const camera = coerceCamera(obj.camera);
  if (camera) shot.camera = camera;
  const motion = optionalStr(obj.motion);
  if (motion) shot.motion = motion;
  const dialogue = optionalStr(obj.dialogue);
  if (dialogue) shot.dialogue = dialogue;
  const narration = optionalStr(obj.narration);
  if (narration) shot.narration = narration;
  const duration = optionalNumber(obj.duration_seconds);
  if (duration !== undefined) shot.duration_seconds = duration;
  return shot;
}

/**
 * Coerce raw model output (a parsed object, a JSON string, or a fenced ```json
 * block) into a validated {@link Screenplay}: assign ids, default missing
 * fields, clamp the shot list to `shotCount`, and stamp every shot with
 * `status: "planned"` and a sequential `index`.
 */
export function parseScreenplay(
  raw: unknown,
  opts: { shotCount: number; title?: string; aspectRatio?: string }
): Screenplay {
  const obj = coerceObject(raw);
  const shotCount = Math.max(0, Math.floor(opts.shotCount));
  const rawShots = Array.isArray(obj.shots) ? obj.shots : [];
  const shots = rawShots
    .slice(0, shotCount)
    .map((rawShot, i) => coerceShot(rawShot, i));

  const screenplay: Screenplay = {
    type: "screenplay",
    id: "screenplay-1",
    title: optionalStr(obj.title) ?? opts.title ?? "Untitled Screenplay",
    aspect_ratio: optionalStr(obj.aspect_ratio) ?? opts.aspectRatio ?? "16:9",
    shots
  };
  const logline = optionalStr(obj.logline);
  if (logline) screenplay.logline = logline;
  const styleBible = optionalStr(obj.style_bible);
  if (styleBible) screenplay.style_bible = styleBible;
  const narration = optionalStr(obj.narration);
  if (narration) screenplay.narration = narration;
  const musicPrompt = optionalStr(obj.music_prompt);
  if (musicPrompt) screenplay.music_prompt = musicPrompt;
  return screenplay;
}

/** Coerce any screenplay-shaped input to a {@link Screenplay}, keeping its shots. */
function toScreenplay(raw: unknown): Screenplay {
  const obj = coerceObject(raw);
  const shotCount = Array.isArray(obj.shots) ? obj.shots.length : 0;
  return parseScreenplay(obj, { shotCount });
}

/**
 * Merge a shot's action, camera direction, motion, and the screenplay's style
 * bible into a single image-generation prompt line.
 */
export function composeShotPrompt(shot: Shot, screenplay: Screenplay): string {
  const parts: string[] = [];
  const action = str(shot.action).trim();
  if (action) parts.push(action);

  const camera = shot.camera ?? {};
  const cameraBits = [camera.framing, camera.lens, camera.angle, camera.movement]
    .map((bit) => str(bit).trim())
    .filter((bit) => bit.length > 0);
  if (cameraBits.length > 0) parts.push(cameraBits.join(", "));

  const motion = str(shot.motion).trim();
  if (motion) parts.push(motion);

  const style = str(screenplay.style_bible).trim();
  if (style) parts.push(style);

  return parts.join(" — ");
}

/**
 * Inject reusable entity descriptors into a prompt for cross-shot consistency.
 * An entity contributes when its name appears in the text, or when the text is
 * empty (all entities apply). Descriptors are appended as a labeled reference
 * block and its reference images are collected, deduped by name+descriptor.
 */
export function injectEntities(
  text: string,
  entities: unknown[]
): { prompt: string; reference_images: ImageRef[] } {
  const base = str(text);
  const lower = base.toLowerCase();
  const empty = base.trim().length === 0;
  const lines: string[] = [];
  const images: ImageRef[] = [];
  const seen = new Set<string>();

  for (const raw of Array.isArray(entities) ? entities : []) {
    const entity = coerceEntity(raw);
    if (!entity) continue;
    const name = entity.name.trim();
    const descriptor = entity.descriptor.trim();
    if (!descriptor) continue;

    const matches = empty || (name.length > 0 && lower.includes(name.toLowerCase()));
    if (!matches) continue;

    const key = `${name}: ${descriptor}`;
    if (seen.has(key)) continue;
    seen.add(key);

    lines.push(name ? `- ${name}: ${descriptor}` : `- ${descriptor}`);
    for (const image of entity.reference_images) images.push(image);
  }

  const prompt =
    lines.length > 0
      ? `${base}\n\nConsistency references:\n${lines.join("\n")}`
      : base;
  return { prompt, reference_images: images };
}

function coerceEntity(
  raw: unknown
): { name: string; descriptor: string; reference_images: ImageRef[] } | null {
  if (isEntity(raw)) {
    return {
      name: str(raw.name),
      descriptor: str(raw.descriptor),
      reference_images: Array.isArray(raw.reference_images)
        ? raw.reference_images
        : []
    };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return {
      name: str(obj.name),
      descriptor: str(obj.descriptor),
      reference_images: Array.isArray(obj.reference_images)
        ? (obj.reference_images as ImageRef[])
        : []
    };
  }
  return null;
}

function clampShotCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(20, n));
}

function buildScreenplaySchema(shotCount: number): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "shots"],
    properties: {
      title: { type: "string" },
      logline: { type: "string" },
      style_bible: { type: "string" },
      aspect_ratio: { type: "string" },
      narration: { type: "string" },
      music_prompt: { type: "string" },
      shots: {
        type: "array",
        minItems: shotCount,
        maxItems: shotCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["action"],
          properties: {
            slug: { type: "string" },
            action: { type: "string" },
            motion: { type: "string" },
            dialogue: { type: "string" },
            narration: { type: "string" },
            duration_seconds: { type: "number" },
            camera: {
              type: "object",
              additionalProperties: false,
              properties: {
                framing: { type: "string" },
                lens: { type: "string" },
                angle: { type: "string" },
                movement: { type: "string" }
              }
            }
          }
        }
      }
    }
  };
}

function buildDirectorPrompt(
  brief: string,
  style: string,
  shotCount: number,
  aspectRatio: string
): string {
  const lines = [
    `Brief:\n${brief}`,
    style.trim() ? `Style:\n${style}` : "",
    `Produce exactly ${shotCount} shots for a ${aspectRatio} piece.`,
    "Give each shot a concrete visual action and camera direction, and set a",
    "style_bible describing the palette, light, lens, and texture applied to all shots."
  ];
  return lines.filter((line) => line.length > 0).join("\n\n");
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export class DirectorNode extends BaseNode {
  static readonly nodeType = "nodetool.creative.Director";
  static readonly title = "Director";
  static readonly body = "content_card";
  static readonly description =
    "Turn a creative brief into a structured screenplay of shots using an LLM.\n    creative, director, screenplay, shots, storyboard\n\n    Use cases:\n    - Planning a short film or ad from a one-line brief\n    - Producing a shot list with camera direction and a consistent style\n    - Seeding a storyboard/timeline pipeline with a typed screenplay";
  static readonly metadataOutputTypes = {
    screenplay: "dict",
    narration: "str",
    music_prompt: "str",
    title: "str"
  };
  static readonly inlineFields = ["brief"];
  static readonly inputFields = ["brief"];
  // Persist the generated screenplay as a generation so it reloads on reopen.
  static readonly autoSaveAsset = true;
  static readonly primaryOutput = "screenplay";

  @prop({
    type: "language_model",
    default: EMPTY_MODEL,
    title: "Model",
    description: "Model to use for directing the screenplay."
  })
  declare model: LanguageModel;

  @prop({
    type: "str",
    default: "",
    title: "Brief",
    description: "The creative brief to turn into a screenplay."
  })
  declare brief: string;

  @prop({
    type: "str",
    default: "",
    title: "Style",
    description: "Optional style guidance applied across every shot."
  })
  declare style: string;

  @prop({
    type: "int",
    default: 5,
    title: "Shot Count",
    description: "How many shots the screenplay should contain.",
    min: 1,
    max: 20
  })
  declare shot_count: number;

  @prop({
    type: "str",
    default: "16:9",
    title: "Aspect Ratio",
    description: "Aspect ratio for the piece (e.g. 16:9, 9:16, 1:1)."
  })
  declare aspect_ratio: string;

  @prop({
    type: "int",
    default: 8192,
    title: "Max Tokens",
    description: "The maximum number of tokens to generate.",
    min: 1,
    max: 100000
  })
  declare max_tokens: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const brief = asText(this.brief ?? "");
    const style = asText(this.style ?? "");
    const shotCount = clampShotCount(this.shot_count);
    const aspectRatio = asText(this.aspect_ratio ?? "").trim() || "16:9";
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (!providerId || !modelId) {
      throw new Error("Select a model");
    }
    if (!context || typeof context.getProvider !== "function") {
      throw new Error("Processing context is required");
    }

    const provider = await context.getProvider(providerId);
    const raw = await generateStructured(provider, {
      model: modelId,
      maxTokens: Number(this.max_tokens ?? 8192),
      messages: [
        { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildDirectorPrompt(brief, style, shotCount, aspectRatio)
        }
      ],
      toolName: "screenplay",
      toolDescription:
        "Submit the finished screenplay with exactly the requested number of shots.",
      schema: buildScreenplaySchema(shotCount)
    });
    if (!raw) {
      throw new Error(
        "Director: the model did not return a screenplay for the screenplay tool."
      );
    }

    const screenplay = parseScreenplay(raw, { shotCount, aspectRatio });
    return {
      screenplay,
      narration: screenplay.narration ?? "",
      music_prompt: screenplay.music_prompt ?? "",
      title: screenplay.title
    };
  }
}

export class ScreenplayShotsNode extends BaseNode {
  static readonly nodeType = "nodetool.creative.ScreenplayShots";
  static readonly title = "Screenplay Shots";
  static readonly description =
    "Fan a screenplay out into one image-generation prompt per shot.\n    creative, screenplay, shots, prompts, storyboard\n\n    Use cases:\n    - Turning a Director screenplay into per-shot prompts\n    - Driving a keyframe generator once per shot\n    - Iterating over shots in a storyboard pipeline";
  static readonly metadataOutputTypes = {
    shot: "dict",
    shot_prompt: "str",
    index: "int",
    output: "list[str]"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["screenplay"];

  // Emit per-shot output_updates even when the handles are wired onward, so the
  // node can show shots as they stream regardless of downstream connections.
  static readonly alwaysEmitOutputUpdates = true;

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    shot: { kind: "iteration", source: "__execution__", group: "items" },
    shot_prompt: { kind: "iteration", source: "__execution__", group: "items" },
    index: { kind: "iteration", source: "__execution__", group: "items" },
    output: { kind: "single", source: "__execution__" }
  };

  @prop({
    type: "dict",
    default: {},
    title: "Screenplay",
    description: "The screenplay to fan out into per-shot prompts."
  })
  declare screenplay: Record<string, unknown>;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const prompts: string[] = [];
    for await (const chunk of this.genProcess(context)) {
      const prompt = (chunk as { shot_prompt?: unknown }).shot_prompt;
      if (typeof prompt === "string") prompts.push(prompt);
    }
    return { output: prompts };
  }

  async *genProcess(
    _context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const screenplay = toScreenplay(this.screenplay);
    const prompts: string[] = [];
    for (const shot of screenplay.shots) {
      const shotPrompt = composeShotPrompt(shot, screenplay);
      prompts.push(shotPrompt);
      yield { shot, shot_prompt: shotPrompt, index: shot.index };
    }
    yield { shot: null, shot_prompt: null, index: null, output: prompts };
  }
}

export class ApplyEntitiesNode extends BaseNode {
  static readonly nodeType = "nodetool.creative.ApplyEntities";
  static readonly title = "Apply Entities";
  static readonly description =
    "Inject reusable entity descriptors into a prompt for cross-shot consistency.\n    creative, entities, consistency, prompt, references\n\n    Use cases:\n    - Keeping a character or style consistent across shots\n    - Appending canonical descriptors to a shot prompt\n    - Collecting reference images for a generation call";
  static readonly metadataOutputTypes = {
    prompt: "str",
    reference_images: "list[image]"
  };
  static readonly inlineFields = ["text"];
  static readonly inputFields = ["text", "entities"];

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description:
      "The prompt to inject entities into. Empty text applies every entity."
  })
  declare text: string;

  @prop({
    type: "list[dict]",
    default: [],
    title: "Entities",
    description: "Entities whose descriptors and reference images are injected."
  })
  declare entities: unknown[];

  async process(): Promise<Record<string, unknown>> {
    const text = asText(this.text ?? "");
    const entities = Array.isArray(this.entities) ? this.entities : [];
    return injectEntities(text, entities);
  }
}

export const DIRECTOR_NODES = tagAsServer([
  DirectorNode,
  ScreenplayShotsNode,
  ApplyEntitiesNode
]);
