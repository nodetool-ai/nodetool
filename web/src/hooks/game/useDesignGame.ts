/**
 * The Game flow's designer: one `generate_text` call answered as structured
 * output against the template's design schema.
 *
 * The prompt is the one the headless `design_game` capability sends — the
 * brief, the template id and its asset manifest — and the answer goes through
 * the same `parseGameDesign`, so a slot the model skipped is filled from the
 * manifest and reported rather than shipped as the designer's words. With no
 * model, a shipped chip's brief falls back to its pinned design, so a keyless
 * install still reaches the review step.
 *
 * Designing places nothing and generates nothing: it writes the design onto
 * `settings.game` and moves the stage to `review`, where every word can be
 * edited before anything is spent.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GAME_DESIGNER_SYSTEM_PROMPT,
  GAME_DESIGN_STAGE,
  GAME_DESIGN_TOOL_DESCRIPTION,
  GAME_DESIGN_TOOL_NAME,
  buildGameDesignSchema,
  designSourceOf,
  findNativeGameTemplate,
  parseGameDesign,
  pinnedGameInspirationChip
} from "@nodetool-ai/protocol";
import { readGameSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import { useGameSetupWriter } from "./useGameSetup";

/** One designer call's output allowance, as `design_game` asks for. */
export const GAME_DESIGNER_MAX_OUTPUT_TOKENS = 4096;

export interface DesignGameInput {
  brief: string;
  template: string;
  model: { provider: string; id: string } | null;
}

export interface UseDesignGameResult {
  /**
   * Design the game and store it. Resolves null when a design was written and
   * otherwise the reason it was not. It never rejects, because the review
   * step's Re-design fires it from a click handler.
   */
  designGame: (input: DesignGameInput) => Promise<string | null>;
  cancelDesign: () => void;
  designing: boolean;
  /** Slot ids the last design had to fill from the template's own words. */
  filled: readonly string[];
  error: string | null;
}

/** Why an answer that arrived was not stored. */
export const DESIGN_SET_ASIDE_REASON =
  "The brief or template changed while the design was being written. Write the design again.";

export const useDesignGame = (workflowId: string): UseDesignGameResult => {
  const store = useWorkflowManagerStore();
  const { setGame } = useGameSetupWriter(workflowId);
  const [designing, setDesigning] = useState(false);
  const [filled, setFilled] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [workflowId]
  );

  // What a design answers, read from the document when it is asked and again
  // when it lands: an answer to an older brief or template is set aside.
  const readSource = useCallback((): string => {
    const game = readGameSetup(
      store.getState().getWorkflow(workflowId)?.settings
    );
    return designSourceOf(game?.template ?? "", (game?.brief ?? "").trim());
  }, [store, workflowId]);

  const designGame = useCallback(
    async (input: DesignGameInput): Promise<string | null> => {
      const brief = input.brief.trim();
      const template = findNativeGameTemplate(input.template);
      if (brief.length === 0) {
        const reason = "Describe the game before designing it.";
        setError(reason);
        return reason;
      }
      if (!template) {
        const reason = `The built-in engine has no ${input.template} template. Pick one above.`;
        setError(reason);
        return reason;
      }
      const token = (requestRef.current += 1);
      const origin = readSource();
      const controller = new AbortController();
      controllerRef.current?.abort();
      controllerRef.current = controller;
      const isCurrent = () =>
        token === requestRef.current &&
        !controller.signal.aborted &&
        readSource() === origin;
      const setAside = () =>
        controller.signal.aborted
          ? "Designing was canceled."
          : DESIGN_SET_ASIDE_REASON;
      setError(null);
      setDesigning(true);
      try {
        let raw: unknown = null;
        if (input.model?.id) {
          const answer = await rpcRequest(
            "generate_text",
            {
              provider: input.model.provider,
              model: input.model.id,
              messages: [
                { role: "system", content: GAME_DESIGNER_SYSTEM_PROMPT },
                {
                  role: "user",
                  content: [
                    `Brief: ${brief}`,
                    `Template: ${template.id}`,
                    "",
                    "Asset manifest:",
                    JSON.stringify(template.manifest.slots, null, 2)
                  ].join("\n")
                }
              ],
              max_tokens: GAME_DESIGNER_MAX_OUTPUT_TOKENS,
              schema: buildGameDesignSchema(template.manifest),
              schema_name: GAME_DESIGN_TOOL_NAME,
              schema_description: GAME_DESIGN_TOOL_DESCRIPTION
            },
            undefined,
            controller.signal
          );
          raw = answer.data;
        } else {
          raw = pinnedGameInspirationChip(template.id, brief)?.design ?? null;
        }
        if (!isCurrent()) {
          return setAside();
        }
        const parsed = parseGameDesign(raw, template.manifest);
        if (!parsed) {
          const reason = input.model?.id
            ? "The designer did not return a design. Try again, or pick another model."
            : "Pick a model to design this, or start from one of the examples.";
          setError(reason);
          return reason;
        }
        setFilled(parsed.filled);
        await setGame({
          design: parsed.design,
          design_source: designSourceOf(template.id, brief),
          stage: GAME_DESIGN_STAGE
        });
        return null;
      } catch (cause) {
        if (!isCurrent()) {
          return setAside();
        }
        const reason = cause instanceof Error ? cause.message : String(cause);
        setError(reason);
        return reason;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setDesigning(false);
        }
      }
    },
    [readSource, setGame]
  );

  const cancelDesign = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) {
      return;
    }
    requestRef.current += 1;
    controller.abort();
    controllerRef.current = null;
    setDesigning(false);
    setError(null);
  }, []);

  return { designGame, cancelDesign, designing, filled, error };
};

export default useDesignGame;
