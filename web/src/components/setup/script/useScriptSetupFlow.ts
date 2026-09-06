/**
 * The script flow's config: the one place that maps a script's `setup.stage`
 * onto a step (PRD § 9.1–9.3, § 6.4).
 *
 * Everything the flow needs is on the document, so any host — the New Project
 * tab, a workspace script tab, the Studio page — builds the same config from a
 * script id and gets the same four steps back. A script with no `setup` reads
 * `done` and belongs to the editor, which is how every script written before
 * the flow existed keeps opening as it always did (D3).
 */

import { createElement, useCallback, useMemo, useRef } from "react";
import type {
  ScriptDocumentSchema,
  ScriptSetupStage
} from "@nodetool-ai/protocol/api-schemas/scripts.js";

import { useScriptStore, useScriptSetup } from "../../../stores/script/ScriptStore";
import { getScriptAgentHandler } from "../../../components/script/scriptAgentBridge";
import { useVoiceCostEstimate } from "../../../hooks/script/useVoiceCostEstimate";
import { useWriteScript } from "../../../hooks/script/useWriteScript";
import type { SetupFlowConfig, SetupStep } from "../types";
import { FormatStep } from "./FormatStep";
import { IdeaStep } from "./IdeaStep";
import { ReviewStep } from "./ReviewStep";
import { VoicesStep } from "./VoicesStep";

/**
 * A script's stage, with the field's absence read as `done` (PRD § 6.4).
 */
export const useScriptSetupStage = (scriptId: string): ScriptSetupStage => {
  const setup = useScriptSetup(scriptId);
  return setup?.stage ?? "done";
};

/**
 * The document a script created from an entry card starts life with: the typed
 * prompt as the brief, the stage at `idea` (PRD § 6.1). Written at create time
 * rather than patched afterwards, so the server copy the flow then loads is
 * already the one the creator asked for.
 */
export const newScriptSetupDocument = (
  brief: string
): ScriptDocumentSchema => ({
  cast: [],
  sections: [],
  setup: { stage: "idea", brief }
});

/**
 * The flow's name, above the stepper. Each step body carries its own heading
 * and subline (PRD § 9.1–9.3), so this says what is being made and no more.
 */
const FLOW_LABELS = { title: "Script" } as const;

/** What the cost line says when nothing has a published rate. */
const formatCost = (cost: number, lineCount: number): string | undefined => {
  if (lineCount === 0) {
    return undefined;
  }
  return cost > 0
    ? `About $${cost.toFixed(2)} to voice ${lineCount} lines`
    : `${lineCount} lines to voice`;
};

export interface ScriptSetupFlowOptions {
  scriptId: string;
  /**
   * Runs after the last step writes stage `done` — the host's cue to show the
   * script it just built (open its tab, navigate to it).
   */
  onFinish?: () => void;
}

export const useScriptSetupFlow = ({
  scriptId,
  onFinish
}: ScriptSetupFlowOptions): SetupFlowConfig<ScriptSetupStage> => {
  const stage = useScriptSetupStage(scriptId);
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const hasLines = useScriptStore(
    (state) =>
      (state.scripts[scriptId]?.sections ?? []).some(
        (section) => section.lines.length > 0
      )
  );
  const castNeedingVoice = useScriptStore(
    (state) =>
      (state.scripts[scriptId]?.cast ?? []).filter(
        (speaker) => !speaker.voice
      ).length
  );
  const { write, writing, error: writeError } = useWriteScript();
  // The reason a refused run gives arrives as state, one render after the call
  // resolves, so the step's own closure cannot see it. Mirror it and read the
  // mirror; when the render has not landed yet the throw still names the step.
  const writeErrorRef = useRef<string | null>(null);
  writeErrorRef.current = writeError;

  const cost = useVoiceCostEstimate(scriptId);

  const onStageChange = useCallback(
    (next: ScriptSetupStage) => setSetup(scriptId, { stage: next }),
    [scriptId, setSetup]
  );

  const finish = useCallback(() => {
    setSetup(scriptId, { stage: "done" });
    onFinish?.();
  }, [onFinish, scriptId, setSetup]);

  const runWriter = useCallback(
    async (rewrite: boolean) => {
      const written = await write(scriptId, { rewrite });
      if (!written) {
        throw new Error(
          writeErrorRef.current ?? "The writer did not return a script."
        );
      }
    },
    [scriptId, write]
  );

  const rewrite = useCallback(() => {
    void write(scriptId, { rewrite: true });
  }, [scriptId, write]);

  const steps = useMemo<SetupStep<ScriptSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        canAdvance: (setup?.brief.trim().length ?? 0) > 0,
        render: () =>
          createElement(IdeaStep, {
            scriptId,
            // The blank escape hatch and the last step land in the same place:
            // stage `done` and the editor (PRD § 9.1).
            onStartBlank: finish
          })
      },
      {
        // Format and review are both step 2, so they collapse to one stepper
        // entry (PRD § 6.2).
        stage: "format",
        label: "Format",
        primaryLabel: "Write the script",
        canAdvance: (setup?.format ?? "") !== "",
        pending: writing,
        render: () => createElement(FormatStep, { scriptId }),
        // The writer runs here, and a refused run must leave the creator on
        // the format step with the reason on the button (PRD § 9.2).
        onAdvance: () => runWriter(false)
      },
      {
        stage: "review",
        label: "Format",
        primaryLabel: "Continue to voices",
        canAdvance: hasLines,
        render: () =>
          createElement(ReviewStep, {
            scriptId,
            onRewrite: rewrite,
            rewriting: writing
          })
      },
      {
        stage: "voices",
        label: "Voices",
        primaryLabel: "Voice your script",
        canAdvance: castNeedingVoice === 0 && hasLines,
        primaryDetail: formatCost(cost.cost, cost.lineCount),
        render: () => createElement(VoicesStep, { scriptId }),
        // Stage `done` is written before the takes are asked for, so a tab
        // closed mid-voicing reopens on the editor with the takes still
        // arriving rather than back in setup (PRD § 9.3, D3).
        onAdvance: async () => {
          setSetup(scriptId, { stage: "done" });
          onFinish?.();
          await getScriptAgentHandler(scriptId).voiceAll();
        }
      }
    ],
    [
      castNeedingVoice,
      cost.cost,
      cost.lineCount,
      finish,
      hasLines,
      onFinish,
      rewrite,
      runWriter,
      scriptId,
      setSetup,
      setup?.brief,
      setup?.format,
      writing
    ]
  );

  return { labels: FLOW_LABELS, steps, stage, onStageChange };
};

export default useScriptSetupFlow;
