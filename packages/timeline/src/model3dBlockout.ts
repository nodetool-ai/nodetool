/**
 * How a shot's blockout reaches the video model that renders a take of it.
 *
 * A model that takes reference video is sent the blockout's reference render.
 * Any other model is sent no reference, and the camera move is written into
 * the prompt instead. The choice is made from the model's declared tasks,
 * never from its name.
 */

/**
 * The model tasks that take a reference video. `reference_to_video` is the one
 * task in the model catalog whose provider call carries reference videos
 * (`BaseProvider.referenceToVideo`). `motion_control` is a chat composer mode
 * with no model task and no provider call behind it, so no model can declare
 * it and it is not listed.
 */
export const BLOCKOUT_REFERENCE_VIDEO_TASKS = ["reference_to_video"] as const;

/**
 * Whether a video model takes a reference video, from the `supported_tasks`
 * the catalog reports for it. A model that declares no tasks does not: the
 * model picker treats `reference_to_video` as a task a model must declare.
 */
export function modelTakesReferenceVideo(
  supportedTasks: readonly string[] | null | undefined
): boolean {
  return (
    supportedTasks?.some((task) =>
      BLOCKOUT_REFERENCE_VIDEO_TASKS.some((accepted) => accepted === task)
    ) ?? false
  );
}

/** What the model is told about the reference video it is sent. */
export const BLOCKOUT_REFERENCE_INSTRUCTION =
  "Follow the camera movement, framing and staging of the reference video. " +
  "The reference is an untextured grey 3D blockout: take its motion and " +
  "composition, not its grey look.";

/** Shown to the user when the selected model takes no reference video. */
export const BLOCKOUT_PROMPT_ONLY_NOTE =
  "This model does not take a reference video. The blockout's camera move " +
  "was added to the prompt as text, and the grey render was not sent.";

export interface BlockoutGenerationInput {
  /** The shot's composed prompt, before any blockout wording. */
  prompt: string;
  /** `supported_tasks` of the selected video model. */
  supportedTasks: readonly string[] | null | undefined;
  /** The blockout clip's current reference video asset. */
  referenceAssetId: string;
  /** `describeModel3DCameraMove` of the blockout clip. */
  cameraMove: string;
}

/** A `reference_videos` entry of the `generate_media` command. */
export interface BlockoutReferenceVideo {
  type: "video";
  asset_id: string;
}

export type BlockoutGenerationPlan =
  | {
      route: "reference_video";
      prompt: string;
      capability: "reference_to_video";
      referenceVideos: BlockoutReferenceVideo[];
    }
  | {
      route: "prompt_only";
      prompt: string;
      /** {@link BLOCKOUT_PROMPT_ONLY_NOTE}, for the surface to show. */
      note: string;
    };

/**
 * Decide what a take generated from a blockout sends.
 *
 * `reference_video`: the reference asset rides in `referenceVideos`, with its
 * full asset id, and the prompt gains {@link BLOCKOUT_REFERENCE_INSTRUCTION}
 * and the camera sentence. `prompt_only`: nothing is attached and the prompt
 * gains the camera sentence alone.
 */
export function planBlockoutGeneration(
  input: BlockoutGenerationInput
): BlockoutGenerationPlan {
  const base = input.prompt.trim();
  const camera = input.cameraMove.trim();
  const join = (...parts: string[]): string =>
    parts.filter((part) => part.length > 0).join("\n\n");
  if (
    modelTakesReferenceVideo(input.supportedTasks) &&
    input.referenceAssetId.length > 0
  ) {
    return {
      route: "reference_video",
      prompt: join(base, `${BLOCKOUT_REFERENCE_INSTRUCTION} ${camera}`.trim()),
      capability: "reference_to_video",
      referenceVideos: [{ type: "video", asset_id: input.referenceAssetId }]
    };
  }
  return {
    route: "prompt_only",
    prompt: join(base, camera),
    note: BLOCKOUT_PROMPT_ONLY_NOTE
  };
}
