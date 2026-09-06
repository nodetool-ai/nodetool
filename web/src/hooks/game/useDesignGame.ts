/**
 * The Game flow's designer (game-prd § 5.2).
 *
 * One `generate_text` call answered as structured output against the schema
 * `buildGameDesignSchema` pins to the chosen template's slot ids, so a model
 * cannot invent a slot the export node has no input for. The answer goes
 * through `parseGameDesign`, which fills anything the model skipped from the
 * manifest's own prompts and reports what it filled.
 *
 * `designGame` places no node and starts no job (criterion 3). It writes
 * `design`, `design_source` and stage `review`. Everything after that is text
 * the creator edits before anything is spent.
 *
 * The call shape is `usePlanWorkflow`'s, including the pinned fallback: a
 * shipped chip carries a design, so a keyless install still reaches the review
 * step and the harness grades the same design a creator would see.
 */

import { useCallback, useRef, useState } from "react";
import {
  designSourceOf,
  buildGameDesignSchema,
  parseGameDesign,
  GAME_DESIGNER_SYSTEM_PROMPT,
  GAME_DESIGN_TOOL_DESCRIPTION,
  GAME_DESIGN_TOOL_NAME,
  GAME_INSPIRATION_CHIPS,
  type GameAssetManifest
} from "@nodetool-ai/protocol";
import {
  readGameSetup,
  type GameDesign,
  type GameSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import { useGameSetupWriter } from "./useGameSetup";

/** How much the designer is allowed to answer with. */
const DESIGN_MAX_OUTPUT_TOKENS = 4096;

export interface DesignGameInput {
  brief: string;
  /** The chosen template's manifest — the schema is pinned to its slot ids. */
  manifest: GameAssetManifest;
  /** Provider and model id for the designer call. */
  model: { provider: string; id: string } | null;
  /** The design the creator has been editing, sent back as context on a re-design. */
  previous?: GameDesign | null;
}

export interface UseDesignGameResult {
  /**
   * Design a brief and store the result. Resolves `null` when a design was
   * written and the reason when the call was refused. It never rejects,
   * because the review step's `Re-design` fires it from a click handler — and
   * it hands the reason back rather than only setting `error`, because the
   * flow shell reads it in the same tick and `error` is a render behind.
   */
  designGame: (input: DesignGameInput) => Promise<string | null>;
  designing: boolean;
  error: string | null;
  /** Slot ids the parser filled from the manifest on the last run. */
  filled: string[];
}

/**
 * The design a shipped inspiration chip carries, when the brief is one
 * verbatim and the template is the chip's own.
 *
 * A creator who presses a chip and has no provider connected still gets a
 * design to review, and it is the same design the harness builds and grades
 * (criterion 5) — so what they see on screen is what was checked.
 */
export const pinnedChipDesign = (
  brief: string,
  template: string | undefined
): GameDesign | null => {
  const chip = GAME_INSPIRATION_CHIPS.find(
    (entry) => entry.brief.toLowerCase() === brief.trim().toLowerCase()
  );
  if (!chip) {
    return null;
  }
  return template === undefined || chip.template === template
    ? chip.design
    : null;
};

/** Whether a brief and template have a pinned design behind them. */
export const hasPinnedDesign = (
  brief: string,
  template: string | undefined
): boolean => pinnedChipDesign(brief, template) !== null;

export const useDesignGame = (workflowId: string): UseDesignGameResult => {
  const [designing, setDesigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState<string[]>([]);
  const { setGame } = useGameSetupWriter(workflowId);
  const store = useWorkflowManagerStore();
  // Which request the hook is still waiting for. A designer call outlives the
  // stage that asked for it, so a late answer must neither overwrite a design
  // a newer request wrote nor pull a creator who has moved on back to the
  // review.
  const requestRef = useRef(0);

  const readStage = useCallback(
    (): GameSetupStage =>
      readGameSetup(store.getState().getWorkflow(workflowId)?.settings)
        ?.stage ?? "done",
    [store, workflowId]
  );

  const designGame = useCallback(
    async (input: DesignGameInput): Promise<string | null> => {
      const brief = input.brief.trim();
      if (brief.length === 0) {
        const reason = "Describe your game before designing it.";
        setError(reason);
        return reason;
      }
      const token = (requestRef.current += 1);
      const originStage = readStage();
      const isCurrent = () =>
        token === requestRef.current && readStage() === originStage;
      setError(null);
      setDesigning(true);
      try {
        const manifest = input.manifest;
        const pinned = pinnedChipDesign(brief, manifest.template);
        let design: GameDesign | null = null;
        let reported: string[] = [];
        if (input.model?.id) {
          const answer = await rpcRequest("generate_text", {
            provider: input.model.provider,
            model: input.model.id,
            system: GAME_DESIGNER_SYSTEM_PROMPT,
            prompt: [
              `Game: ${brief}`,
              `Template: ${manifest.template} (Godot ${manifest.godot})`,
              "",
              "Asset slots:",
              ...manifest.slots.map(
                (slot) =>
                  `- ${slot.id} (${slot.kind})${
                    slot.prompt ? `: ${slot.prompt}` : ""
                  }`
              ),
              ...(input.previous
                ? [
                    "",
                    "The design so far, which the creator has edited. Revise it:",
                    JSON.stringify(input.previous)
                  ]
                : [])
            ].join("\n"),
            max_tokens: DESIGN_MAX_OUTPUT_TOKENS,
            schema: buildGameDesignSchema(manifest),
            schema_name: GAME_DESIGN_TOOL_NAME,
            schema_description: GAME_DESIGN_TOOL_DESCRIPTION
          });
          const parsed = answer.data
            ? parseGameDesign(answer.data, manifest)
            : null;
          design = parsed?.design ?? null;
          reported = parsed?.filled ?? [];
        }
        // No model, or an answer that was not a design: a shipped chip falls
        // back to its pinned design so the creator still reaches the review.
        const resolved = design ?? pinned;
        // The creator left the stage this design was asked from, or asked
        // again. The design they are looking at now stays, and the refusal of
        // a request they abandoned is not reported over what they are reading.
        if (!isCurrent()) {
          return null;
        }
        if (!resolved) {
          const reason = input.model?.id
            ? "The designer did not return a design. Try again, or write the sections by hand."
            : "Connect a provider to design this, or start from one of the examples.";
          setError(reason);
          return reason;
        }
        setFilled(design ? reported : []);
        // Nothing above placed a node — criterion 3. `design_source` records
        // what this design answers, so returning to the template step and
        // pressing its button continues to this design rather than replacing it.
        await setGame({
          design: resolved,
          design_source: designSourceOf(manifest.template, brief),
          stage: "review"
        });
        return null;
      } catch (cause) {
        if (!isCurrent()) {
          return null;
        }
        // The provider's own words — a 429, a model that no longer exists, a
        // missing key. Reporting them beats a generic refusal: only these say
        // what the creator has to change.
        const reason = cause instanceof Error ? cause.message : String(cause);
        setError(reason);
        return reason;
      } finally {
        if (token === requestRef.current) {
          setDesigning(false);
        }
      }
    },
    [readStage, setGame]
  );

  return { designGame, designing, error, filled };
};

export default useDesignGame;
