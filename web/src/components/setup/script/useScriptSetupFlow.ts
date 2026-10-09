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

import { createElement, useCallback, useMemo, useState } from "react";
import type {
  ScriptDocumentSchema,
  ScriptSetup,
  ScriptSetupStage
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import type { CreativeContext } from "@nodetool-ai/protocol";

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
import { FormatStep, WriterModelFooterField } from "./FormatStep";
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
  /** Shared production context carried from the creation surface. */
  creativeContext?: CreativeContext;
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
  const document: ScriptDocumentSchema = { cast: [], sections: [], setup };
  if (context?.creativeContext) {
    document.creative_context = context.creativeContext;
  }
  return document;
};

/**
 * The flow's name, above the stepper. Each step body carries its own heading
 * and subline (PRD § 9.1–9.3), so this says what is being made and no more.
 */
const FLOW_LABELS = { title: "Script" } as const;

const linesLabel = (count: number): string =>
  `${count} ${count === 1 ? "line" : "lines"}`;

/**
 * The Voices step's cost line. A figure covers only the lines that priced, so
 * a partly priced script says how many of its lines the figure leaves out.
 */
export const formatCost = (
  cost: number,
  lineCount: number,
  pricedLineCount: number
): string | undefined => {
  if (lineCount === 0) {
    return undefined;
  }
  if (cost <= 0) {
    return `${linesLabel(lineCount)} to voice`;
  }
  if (pricedLineCount < lineCount) {
    return `About $${cost.toFixed(2)} for ${pricedLineCount} of ${linesLabel(lineCount)}, the rest unpriced`;
  }
  return `About $${cost.toFixed(2)} to voice ${linesLabel(lineCount)}`;
};

export interface ScriptSetupFlowOptions {
  scriptId: string;
  /**
   * Runs after the last step writes stage `done` — the host's cue to show the
   * script it just built (open its tab, navigate to it).
   */
  onFinish?: () => void | Promise<void>;
}

export const useScriptSetupFlow = ({
  scriptId,
  onFinish
}: ScriptSetupFlowOptions): SetupFlowConfig<ScriptSetupStage> => {
  const stage = useScriptSetupStage(scriptId);
  const [formatError, setFormatError] = useState<string | null>(null);
  // A file still being read lands on the script after Continue would have
  // moved on, so the idea step holds until it is in.
  const [importingFile, setImportingFile] = useState(false);
  const chatModel = useGlobalChatStore((state) => state.selectedModel);
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const hasLines = useScriptStore((state) =>
    (state.scripts[scriptId]?.sections ?? []).some(
      (section) => section.lines.length > 0
    )
  );
  const lineCount = useScriptStore((state) =>
    (state.scripts[scriptId]?.sections ?? []).reduce(
      (count, section) => count + section.lines.length,
      0
    )
  );
  // A rewrite sends the script as it stands, so its estimate prices the lines.
  const lineTexts = useScriptStore((state) =>
    (state.scripts[scriptId]?.sections ?? [])
      .flatMap((section) => section.lines.map((line) => line.text))
      .join("\n")
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
  // Lines with words and nobody to say them. Voicing skips a line with no
  // voice, so without a speaker it would come out silent and unreported (F7).
  const unassignedLines = useScriptStore((state) =>
    (state.scripts[scriptId]?.sections ?? []).reduce(
      (count, section) =>
        count +
        section.lines.filter(
          (line) =>
            line.text.trim() !== "" &&
            !line.speakerId &&
            !line.voiceOverride
        ).length,
      0
    )
  );
  const {
    write,
    cancel,
    writing,
    error: writeError,
    errorRef: writeErrorRef
  } = useWriteScript();

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
    void Promise.resolve(onFinish?.()).catch((error: unknown) => {
      console.error("Failed to open the finished script", error);
    });
  }, [onFinish, scriptId, setSetup]);

  const runWriter = useCallback(
    async (rewrite: boolean, signal?: AbortSignal) => {
      const written = await write(scriptId, { rewrite, signal });
      if (!written) {
        throw new Error(
          writeErrorRef.current ?? "The writer did not return a script."
        );
      }
    },
    [scriptId, write, writeErrorRef]
  );

  // A refused rewrite shows its reason on the review through `writeError`.
  const rewrite = useCallback(() => {
    void write(scriptId, { rewrite: true });
  }, [scriptId, write]);

  const unassignedReason =
    unassignedLines > 0
      ? `Pick a speaker for ${unassignedLines} ${
          unassignedLines === 1 ? "line" : "lines"
        }. A line with no speaker is not voiced.`
      : undefined;

  // What the format step's button is about to spend, when it spends anything.
  const writeEstimate = useMemo<
    Pick<SetupStep<ScriptSetupStage>, "generation">
  >(
    () =>
      needsWrite
        ? {
            generation: {
              result: imported
                ? hasLines
                  ? `Prepare ${imported.lines.length} lines again from your import, replacing edits made in the review`
                  : `Prepare ${imported.lines.length} existing lines, keeping your words`
                : hasLines
                  ? `Rewrite your ${linesLabel(lineCount)} for about ${setup?.length_seconds ?? 60} seconds of speech, keeping your edits as context`
                  : `Write a text script for about ${setup?.length_seconds ?? 60} seconds of speech`,
              next: "Review and edit the lines next. Choose voices and generate audio separately in Voices.",
              model: writerModel,
              // The call sends the imported words, or the script it rewrites,
              // along with the brief, so the estimate prices them too.
              brief: [
                setup?.brief ?? "",
                imported ? imported.text : hasLines ? lineTexts : ""
              ]
                .filter((part) => part !== "")
                .join("\n"),
              maxOutputTokens: 8192,
              noModelCall: imported?.attributed
            }
          }
        : {},
    [
      hasLines,
      imported,
      lineCount,
      lineTexts,
      needsWrite,
      setup?.brief,
      setup?.length_seconds,
      writerModel
    ]
  );

  const steps = useMemo<SetupStep<ScriptSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        // Imported words are enough on their own: they say what the script is,
        // and the brief beside them is a note for the attribution pass (F3).
        canAdvance:
          !importingFile &&
          ((setup?.brief.trim().length ?? 0) > 0 || imported !== null),
        blockedReason: importingFile
          ? "Reading your file"
          : "Describe what to write, or import your script",
        render: (context) =>
          createElement(IdeaStep, {
            scriptId,
            readOnly: context?.readOnly ?? false,
            // The blank escape hatch and the last step land in the same place:
            // stage `done` and the editor (PRD § 9.1).
            onStartBlank: finish,
            onImportingChange: setImportingFile
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
          formatError === null &&
          (setup?.format ?? "") !== "" &&
          (!needsModel || Boolean(writerModel?.id)),
        blockedReason:
          formatError ??
          (!setup?.format ? "Pick a script format" : "Pick a writer model"),
        // No model runs when the script already answers these inputs, so
        // nothing is estimated either (PRD § 6.2) — the step carries no
        // `generation` at all rather than an empty one.
        ...writeEstimate,
        pending: writing,
        pendingLabel: "Writing your script",
        footerControls: (context) =>
          createElement(WriterModelFooterField, {
            scriptId,
            readOnly: context.readOnly
          }),
        render: (context) =>
          createElement(FormatStep, {
            scriptId,
            readOnly: context?.readOnly ?? false,
            onValidationChange: setFormatError
          }),
        // The writer runs here, and a refused run must leave the creator on
        // the format step with the reason on the button (PRD § 9.2). It runs
        // only when something it reads has moved: coming back to look at the
        // cards and pressing on used to pay for a second script and throw the
        // edits made to the first away (F15). Lines already on the script are
        // handed to the writer as they stand, so review edits are rewritten
        // rather than discarded. An import is prepared again from its words.
        onAdvance: needsWrite
          ? (context) =>
              runWriter(hasLines && imported === null, context?.signal)
          : undefined,
        onCancel: cancel
      },
      {
        stage: "review",
        label: "Format",
        primaryLabel: "Continue to voices",
        // Empty lines produce no take and no audio, so they are caught before
        // the creator pays for the rest of the script (F20).
        canAdvance: hasLines && !hasEmptyLine && unassignedLines === 0,
        blockedReason: !hasLines
          ? "Add at least one script line"
          : hasEmptyLine
            ? "Every line needs words, or remove it"
            : unassignedReason,
        // `Rewrite` runs outside the shell's primary button, so the shell has
        // to read its wait: the creator cannot move on to voices while the
        // lines they are reading are being replaced (F2).
        pending: writing,
        pendingLabel: "Rewriting your script",
        onCancel: cancel,
        render: (context) =>
          createElement(ReviewStep, {
            scriptId,
            readOnly: context?.readOnly ?? false,
            onRewrite: rewrite,
            rewriting: writing,
            error: writeError,
            onOpenEditor: finish
          })
      },
      {
        stage: "voices",
        label: "Voices",
        primaryLabel: "Voice your script",
        canAdvance: castNeedingVoice === 0 && hasLines && unassignedLines === 0,
        blockedReason: !hasLines
          ? "Add at least one script line"
          : (unassignedReason ?? "Choose a voice for every speaker"),
        primaryDetail: formatCost(
          cost.cost,
          cost.lineCount,
          cost.pricedLineCount
        ),
        render: (context) =>
          createElement(VoicesStep, {
            scriptId,
            readOnly: context?.readOnly ?? false
          }),
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
          // The handler is taken while this flow's host is still mounted: the
          // host may hand the script to another surface once onFinish runs.
          const voicing = getScriptAgentHandler(scriptId).voiceAll();
          // Voicing has started, so a failed hand-off is logged rather than
          // thrown: the primary button must not report a run that is going.
          try {
            await onFinish?.();
          } catch (error) {
            console.error("Failed to open the finished script", error);
          }
          await voicing;
        }
      }
    ],
    [
      cancel,
      formatError,
      castNeedingVoice,
      cost.cost,
      cost.lineCount,
      cost.pricedLineCount,
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
      importingFile,
      writeEstimate,
      needsModel,
      needsWrite,
      hasEmptyLine,
      setup?.length_seconds,
      unassignedLines,
      unassignedReason,
      writeError
    ]
  );

  return { labels: FLOW_LABELS, steps, stage, onStageChange };
};

export default useScriptSetupFlow;
