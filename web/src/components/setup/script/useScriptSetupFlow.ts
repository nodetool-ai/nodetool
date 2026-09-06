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
  ScriptSetup,
  ScriptSetupStage
} from "@nodetool-ai/protocol/api-schemas/scripts.js";

import {
  useScriptStore,
  useScriptSetup
} from "../../../stores/script/ScriptStore";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import {
  readScriptSource,
  scriptSourcePatch,
  type ImportedScript
} from "../../../lib/script/importedScript";
import {
  scriptSetupContextPatch,
  type ScriptSetupContext
} from "./scriptSetupContext";
import { getScriptAgentHandler } from "../../../components/script/scriptAgentBridge";
import { useVoiceCostEstimate } from "../../../hooks/script/useVoiceCostEstimate";
import { useWriteScript } from "../../../hooks/script/useWriteScript";
import {
  readWriterSignature,
  writerSignature
} from "../../../hooks/script/scriptWriteSignature";
import { voicingPatch } from "../../../stores/script/scriptVoicing";
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
 * What an entry card may hand the new script besides the prompt: the composer's
 * attachments and selected entities, and a script file it carried in, which
 * arrives as a source so its speakers and cue timings survive (F3, F4).
 */
export interface NewScriptContext extends Partial<ScriptSetupContext> {
  /** A handed-over script file, already read by `importedFromFile`. */
  source?: ImportedScript;
}

/**
 * The document a script created from an entry card starts life with: the typed
 * prompt as the brief, the stage at `idea` (PRD § 6.1). Written at create time
 * rather than patched afterwards, so the server copy the flow then loads is
 * already the one the creator asked for.
 *
 * `context` is optional and adds only what it holds, so a caller that passes
 * nothing produces exactly the document it always did (PRD § 6.4).
 */
export const newScriptSetupDocument = (
  brief: string,
  context?: NewScriptContext
): ScriptDocumentSchema => {
  const setup: ScriptSetup = {
    stage: "idea",
    brief,
    ...scriptSetupContextPatch(context)
  };
  // The field is absent, not `undefined`: a caller that hands over no script
  // file produces exactly the document this constructor always produced.
  if (context?.source !== undefined) {
    Object.assign(setup, scriptSourcePatch(context.source));
  }
  return { cast: [], sections: [], setup };
};

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
  const chatModel = useGlobalChatStore((state) => state.selectedModel);
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const hasLines = useScriptStore((state) =>
    (state.scripts[scriptId]?.sections ?? []).some(
      (section) => section.lines.length > 0
    )
  );
  const hasEmptyLine = useScriptStore((state) =>
    (state.scripts[scriptId]?.sections ?? []).some((section) =>
      section.lines.some((line) => line.text.trim() === "")
    )
  );
  // Only the speakers who actually say something need a voice. Requiring one
  // for a speaker with no lines left the button dead with nothing to fix (F16).
  const castNeedingVoice = useScriptStore((state) => {
    const script = state.scripts[scriptId];
    if (!script) {
      return 0;
    }
    const speaking = new Set(
      script.sections
        .flatMap((section) => section.lines)
        .filter((line) => line.text.trim() !== "")
        .map((line) => line.speakerId)
    );
    return script.cast.filter(
      (speaker) => speaking.has(speaker.id) && !speaker.voice
    ).length;
  });
  const { write, writing, error: writeError } = useWriteScript();
  // The reason a refused run gives arrives as state, one render after the call
  // resolves, so the step's own closure cannot see it. Mirror it and read the
  // mirror; when the render has not landed yet the throw still names the step.
  const writeErrorRef = useRef<string | null>(null);
  writeErrorRef.current = writeError;

  const cost = useVoiceCostEstimate(scriptId);
  const writerModel = setup?.writer_model ?? chatModel ?? null;
  const imported = useMemo(() => readScriptSource(setup), [setup]);
  // Whether the script in the review still answers the inputs on the format
  // step. Unchanged inputs mean there is nothing to write: the button carries
  // the creator forward to the script they came back from (F15).
  const inputsChanged =
    readWriterSignature(setup) !== writerSignature(setup, imported);
  const needsWrite = !hasLines || inputsChanged;
  // An attributed import is applied as it stands, with no model in the loop, so
  // it does not need a writer model to be picked first (F16).
  const needsModel = needsWrite && imported?.attributed !== true;

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

  // What the format step's button is about to spend, when it spends anything.
  const writeEstimate = useMemo<Pick<SetupStep<ScriptSetupStage>, "generation">>(
    () =>
      needsWrite
        ? {
            generation: {
              result: imported
                ? `Prepare ${imported.lines.length} existing lines, keeping your words`
                : `Write a text script for about ${setup?.length_seconds ?? 60} seconds of speech`,
              next: "Review and edit the lines next. Choose voices and generate audio separately in Voices.",
              model: writerModel,
              brief: setup?.brief ?? "",
              maxOutputTokens: 8192,
              noModelCall: imported?.attributed
            }
          }
        : {},
    [imported, needsWrite, setup?.brief, setup?.length_seconds, writerModel]
  );

  const steps = useMemo<SetupStep<ScriptSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        // Imported words are enough on their own: they say what the script is,
        // and the brief beside them is a note for the attribution pass (F3).
        canAdvance: (setup?.brief.trim().length ?? 0) > 0 || imported !== null,
        blockedReason: "Describe what to write, or import your script",
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
        primaryLabel: needsWrite
          ? hasLines
            ? "Rewrite"
            : "Write the script"
          : "Continue to review",
        canAdvance:
          (setup?.format ?? "") !== "" &&
          (!needsModel || Boolean(writerModel?.id)),
        blockedReason: !setup?.format
          ? "Pick a script format"
          : "Pick a writer model",
        // No model runs when the script already answers these inputs, so
        // nothing is estimated either (PRD § 6.2) — the step carries no
        // `generation` at all rather than an empty one.
        ...writeEstimate,
        pending: writing,
        pendingLabel: "Writing your script",
        render: () => createElement(FormatStep, { scriptId }),
        // The writer runs here, and a refused run must leave the creator on
        // the format step with the reason on the button (PRD § 9.2). It runs
        // only when something it reads has moved: coming back to look at the
        // cards and pressing on used to pay for a second script and throw the
        // edits made to the first away (F15).
        onAdvance: needsWrite ? () => runWriter(false) : undefined
      },
      {
        stage: "review",
        label: "Format",
        primaryLabel: "Continue to voices",
        // Empty lines produce no take and no audio, so they are caught before
        // the creator pays for the rest of the script (F20).
        canAdvance: hasLines && !hasEmptyLine,
        blockedReason: hasLines
          ? "Every line needs words, or remove it"
          : "Add at least one script line",
        // `Rewrite` runs outside the shell's primary button, so the shell has
        // to read its wait: the creator cannot move on to voices while the
        // lines they are reading are being replaced (F2).
        pending: writing,
        pendingLabel: "Rewriting your script",
        render: () =>
          createElement(ReviewStep, {
            scriptId,
            onRewrite: rewrite,
            rewriting: writing,
            onOpenEditor: finish
          })
      },
      {
        stage: "voices",
        label: "Voices",
        primaryLabel: "Voice your script",
        canAdvance: castNeedingVoice === 0 && hasLines,
        blockedReason: hasLines
          ? "Choose a voice for every speaker"
          : "Add at least one script line",
        primaryDetail: formatCost(cost.cost, cost.lineCount),
        render: () => createElement(VoicesStep, { scriptId }),
        // Stage `done` is written before the takes are asked for, so a tab
        // closed mid-voicing reopens on the editor with the takes still
        // arriving rather than back in setup (PRD § 9.3, D3).
        onAdvance: async () => {
          // Queued, then opened, then completed: `voiceAll` moves the record to
          // `running` and finally to `completed` with the lines that failed, so
          // an editor opened before the takes land can still say what happened
          // and a reload does not lose it (F8).
          setSetup(scriptId, {
            stage: "done",
            ...voicingPatch({
              status: "queued",
              total: cost.lineCount,
              voiced: 0,
              failed: [],
              updatedAt: new Date().toISOString()
            })
          });
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
      writing,
      writerModel,
      imported,
      writeEstimate,
      needsModel,
      needsWrite,
      hasEmptyLine,
      setup?.length_seconds
    ]
  );

  return { labels: FLOW_LABELS, steps, stage, onStageChange };
};

export default useScriptSetupFlow;
