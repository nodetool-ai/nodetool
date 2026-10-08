/**
 * `expandBrief` — one `generate_text` call that turns a typed sentence into the
 * five-field brief the review step edits (PRD § 10.2).
 *
 * This is the step D4 exists for: nothing is rendered, no layer is added and no
 * job is started here. The whole run is one structured-output request whose
 * answer lands on the document's `setup.refined`, so the creator reads and
 * fixes the model's reading of their sentence before the look step spends
 * anything.
 *
 * The prompt, the schema and the parse come from `@nodetool-ai/protocol`, so a
 * brief refined here and one refined by the headless `refine_image_brief` are
 * the same request.
 *
 * The flow's language-model picker updates the session's chat model. The hook
 * names that model so the step can price the call before it is made; a caller
 * that names none — the `ui_sketch_refine_brief` tool — leaves the choice to
 * the server as before.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  REFINE_BRIEF_SCHEMA,
  REFINE_BRIEF_SYSTEM_PROMPT,
  REFINE_BRIEF_TOOL_DESCRIPTION,
  REFINE_BRIEF_TOOL_NAME,
  buildRefineBriefPrompt,
  parseRefinedBrief,
  type SketchRefinedBrief
} from "@nodetool-ai/protocol/api-schemas/sketch.js";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { useSketchStore } from "../../components/sketch/state/useSketchStore";
import {
  MAX_IMAGE_REFERENCES,
  imageReferences,
  readReferences
} from "../../components/setup/image/setupContext";
import useGlobalChatStore from "../../stores/GlobalChatStore";

/** The language model a refinement runs against, when one is known. */
export interface RefineBriefModel {
  id: string;
  provider: string;
  name?: string;
}

/** The answer's ceiling, and what the step's estimate is measured against. */
export const REFINE_BRIEF_MAX_TOKENS = 2048;

/**
 * What the answer was expanded from. The use-case step compares it with what
 * the document holds now, so returning to that step and pressing its button
 * again continues to the brief already written instead of paying for the same
 * expansion twice (F15).
 */
export const briefInputSignature = (
  setup: { brief?: string; use_case?: string } | undefined
): string => `${setup?.brief?.trim() ?? ""}␟${setup?.use_case ?? ""}`;

/**
 * The creator's edited fields, as a block appended to the prompt. The model is
 * asked to keep what they wrote and only tighten it.
 */
const editedBriefInstruction = (current: SketchRefinedBrief): string =>
  [
    "The creator already edited an earlier brief. Keep their wording and decisions, fill any empty field from the sentence above, and only tighten the rest:",
    `Subject: ${current.subject}`,
    `Composition: ${current.composition}`,
    `Lighting: ${current.lighting}`,
    `Style words: ${current.style_words}`,
    `Leave out: ${current.negative}`
  ].join("\n");

/**
 * One expansion, with no React around it. The hook and the
 * `ui_sketch_refine_brief` tool both call this, so the agent and the flow send
 * the same request and read the answer the same way (PRD § 10.6).
 *
 * Throws when there is nothing to expand or the model answers with nothing
 * usable — the caller decides whether that is a message on a button or a
 * rejected tool call.
 */
export async function requestRefinedBrief(
  setup: {
    brief?: string;
    use_case?: string;
    /** Image URIs the creator attached to the prompt (F4). */
    references?: readonly string[];
    /**
     * The five fields as the creator left them on the review. When present,
     * the model polishes these instead of expanding the sentence from scratch,
     * so `Re-refine` keeps hand edits (O4).
     */
    current?: SketchRefinedBrief;
  },
  model?: RefineBriefModel,
  signal?: AbortSignal
): Promise<SketchRefinedBrief> {
  const brief = setup.brief?.trim() ?? "";
  if (brief.length === 0) {
    throw new Error("Describe the image before refining the brief.");
  }
  const basePrompt = buildRefineBriefPrompt(brief, setup.use_case);
  const prompt = setup.current
    ? `${basePrompt}\n\n${editedBriefInstruction(setup.current)}`
    : basePrompt;
  const references = (setup.references ?? []).slice(0, MAX_IMAGE_REFERENCES);
  const request: Record<string, unknown> = {
    // A reference travels as content blocks, the shape `generate_text` reads a
    // picture from — the same one the storyboard's custom style uses. With no
    // reference the request is the plain system/prompt pair it always was.
    ...(references.length > 0
      ? {
          messages: [
            { role: "system", content: REFINE_BRIEF_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${prompt}\n\nThe creator attached the images below. Read them for subject, composition, lighting and style words, and let them settle anything the sentence leaves open.`
                },
                ...references.map((uri) => ({
                  type: "image_url",
                  image: { type: "image", uri }
                }))
              ]
            }
          ]
        }
      : { system: REFINE_BRIEF_SYSTEM_PROMPT, prompt }),
    max_tokens: REFINE_BRIEF_MAX_TOKENS,
    schema: REFINE_BRIEF_SCHEMA,
    schema_name: REFINE_BRIEF_TOOL_NAME,
    schema_description: REFINE_BRIEF_TOOL_DESCRIPTION
  };
  // Named only when the caller has one. The `ui_sketch_refine_brief` tool
  // names none, and the keys stay off the request rather than being sent as
  // `undefined`, so the server picks the session's model as it always has.
  if (model) {
    request.provider = model.provider;
    request.model = model.id;
  }
  const answer = await rpcRequest("generate_text", request, undefined, signal);
  const refined = parseRefinedBrief(answer.data);
  if (!refined) {
    throw new Error("The model did not return a brief. Try again.");
  }
  return refined;
}

/**
 * How one expansion ended. `error` is null when the run was canceled or a
 * newer one replaced it, so there is nothing to tell the creator.
 */
export type RefineBriefOutcome =
  | { ok: true }
  | { ok: false; error: string | null };

export interface RefineBriefOptions {
  /** Send the review's edited fields so the answer polishes them (O4). */
  keepEdits?: boolean;
}

export interface RefineBriefResult {
  /**
   * Expand the document's brief and write the answer onto `setup.refined`,
   * leaving the stage at `review`. The outcome carries the failure reason
   * directly, because the `error` state only reaches the caller one render
   * later (F5).
   */
  expandBrief: (
    signal?: AbortSignal,
    options?: RefineBriefOptions
  ) => Promise<RefineBriefOutcome>;
  cancel: () => void;
  refining: boolean;
  error: string | null;
  /** The model the next expansion runs against, or null when none is set. */
  model: RefineBriefModel | null;
}

export function useRefineBrief(): RefineBriefResult {
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedModel = useGlobalChatStore((state) => state.selectedModel);
  const model = useMemo<RefineBriefModel | null>(
    () =>
      selectedModel?.id
        ? {
            id: selectedModel.id,
            provider: selectedModel.provider,
            name: selectedModel.name
          }
        : null,
    [selectedModel?.id, selectedModel?.name, selectedModel?.provider]
  );
  // Which request the hook is still waiting for. A model call outlives the
  // stage that asked for it, so an older answer must neither replace the brief
  // a newer one wrote nor clear the wait a newer one owns.
  const requestRef = useRef(0);

  const controllerRef = useRef<AbortController | null>(null);
  const cancel = useCallback(() => controllerRef.current?.abort(), []);
  useEffect(() => cancel, [cancel]);

  const expandBrief = useCallback(
    async (
      signal?: AbortSignal,
      options?: RefineBriefOptions
    ): Promise<RefineBriefOutcome> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        controller.abort();
      }
      const token = (requestRef.current += 1);
      const setup = useSketchStore.getState().document.setup;
      const originStage = setup?.stage;
      const chosen = useGlobalChatStore.getState().selectedModel;
      setError(null);
      setRefining(true);
      try {
        const refined = await requestRefinedBrief(
          {
            brief: setup?.brief,
            use_case: setup?.use_case,
            references: imageReferences(readReferences(setup)).map(
              (reference) => reference.uri
            ),
            current: options?.keepEdits ? setup?.refined : undefined
          },
          chosen?.id
            ? { id: chosen.id, provider: chosen.provider, name: chosen.name }
            : undefined,
          controller.signal
        );
        // The creator left the stage this expansion was asked from, so the
        // brief they are reading now stays: a late answer neither replaces it
        // nor pulls them back to the review.
        if (
          controller.signal.aborted ||
          token !== requestRef.current ||
          useSketchStore.getState().document.setup?.stage !== originStage
        ) {
          return { ok: false, error: null };
        }
        useSketchStore.getState().setSetup({
          refined,
          stage: "review",
          refined_from: briefInputSignature(setup)
        });
        return { ok: true };
      } catch (cause) {
        if (controller.signal.aborted || token !== requestRef.current) {
          return { ok: false, error: null };
        }
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        return { ok: false, error: message };
      } finally {
        signal?.removeEventListener("abort", abort);
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        if (token === requestRef.current) {
          setRefining(false);
        }
      }
    },
    []
  );

  return { expandBrief, cancel, refining, error, model };
}

export default useRefineBrief;
