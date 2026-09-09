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

import { useCallback, useMemo, useRef, useState } from "react";
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
  },
  model?: RefineBriefModel
): Promise<SketchRefinedBrief> {
  const brief = setup.brief?.trim() ?? "";
  if (brief.length === 0) {
    throw new Error("Describe the image before refining the brief.");
  }
  const prompt = buildRefineBriefPrompt(brief, setup.use_case);
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
  const answer = await rpcRequest("generate_text", request);
  const refined = parseRefinedBrief(answer.data);
  if (!refined) {
    throw new Error("The model did not return a brief. Try again.");
  }
  return refined;
}

export interface RefineBriefResult {
  /**
   * Expand the document's brief and write the answer onto `setup.refined`,
   * leaving the stage at `review`. Resolves `false` when the run was refused
   * or the model answered with nothing usable; the reason is in `error`.
   */
  expandBrief: () => Promise<boolean>;
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

  const expandBrief = useCallback(async (): Promise<boolean> => {
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
          )
        },
        chosen?.id
          ? { id: chosen.id, provider: chosen.provider, name: chosen.name }
          : undefined
      );
      // The creator left the stage this expansion was asked from, so the
      // brief they are reading now stays: a late answer neither replaces it
      // nor pulls them back to the review.
      if (
        token !== requestRef.current ||
        useSketchStore.getState().document.setup?.stage !== originStage
      ) {
        return false;
      }
      useSketchStore.getState().setSetup({
        refined,
        stage: "review",
        refined_from: briefInputSignature(setup)
      });
      return true;
    } catch (cause) {
      if (token !== requestRef.current) {
        return false;
      }
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      if (token === requestRef.current) {
        setRefining(false);
      }
    }
  }, []);

  return { expandBrief, refining, error, model };
}

export default useRefineBrief;
