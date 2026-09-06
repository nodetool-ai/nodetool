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
 * No model picker: the request names no provider, so the session's default
 * language model answers it — the flow asks the creator what they want a
 * picture of, not which model should read the sentence.
 */

import { useCallback, useState } from "react";
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

/**
 * One expansion, with no React around it. The hook and the
 * `ui_sketch_refine_brief` tool both call this, so the agent and the flow send
 * the same request and read the answer the same way (PRD § 10.6).
 *
 * Throws when there is nothing to expand or the model answers with nothing
 * usable — the caller decides whether that is a message on a button or a
 * rejected tool call.
 */
export async function requestRefinedBrief(setup: {
  brief?: string;
  use_case?: string;
}): Promise<SketchRefinedBrief> {
  const brief = setup.brief?.trim() ?? "";
  if (brief.length === 0) {
    throw new Error("Describe the image before refining the brief.");
  }
  const answer = await rpcRequest("generate_text", {
    system: REFINE_BRIEF_SYSTEM_PROMPT,
    prompt: buildRefineBriefPrompt(brief, setup.use_case),
    max_tokens: 2048,
    schema: REFINE_BRIEF_SCHEMA,
    schema_name: REFINE_BRIEF_TOOL_NAME,
    schema_description: REFINE_BRIEF_TOOL_DESCRIPTION
  });
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
}

export function useRefineBrief(): RefineBriefResult {
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expandBrief = useCallback(async (): Promise<boolean> => {
    setError(null);
    setRefining(true);
    try {
      const setup = useSketchStore.getState().document.setup;
      const refined = await requestRefinedBrief({
        brief: setup?.brief,
        use_case: setup?.use_case
      });
      useSketchStore.getState().setSetup({ refined, stage: "review" });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setRefining(false);
    }
  }, []);

  return { expandBrief, refining, error };
}

export default useRefineBrief;
