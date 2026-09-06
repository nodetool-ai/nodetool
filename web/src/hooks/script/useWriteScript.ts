/**
 * useWriteScript
 *
 * Step 2's `Write the script` and the review's `Rewrite` (PRD § 9.2): one
 * `generate_text` request against the brief, the format and the length,
 * answered as structured output and applied to the cast and the lines through
 * the store. No workflow, no job row, and no take — voicing is step 3.
 *
 * Which request depends on where the words came from:
 *
 * - Imported words are the creator's, so `Write the script` never sends them
 *   back to be rewritten. A Final Draft or subtitle import already says who
 *   speaks and is applied with no model call at all; pasted or extracted text
 *   goes to an attribution call whose schema has no field for text, and every
 *   line's words come from the split rather than from the answer (criterion 4).
 * - `Rewrite` is the one thing that gives those words up, which is why it
 *   drops the import: it is an explicit ask for a different script, and
 *   re-applying the import would throw away the edits made in the review.
 * - Everything else goes to the writer. A rewrite is handed the script as it
 *   stands and the ids it must send back, so a line it keeps keeps its takes
 *   and its shot link.
 *
 * The prompt, the schema and the parse live in `@nodetool-ai/protocol`, so a
 * script written here and one written by the headless `write_script` capability
 * are the same artifact.
 */

import { useCallback, useState } from "react";
import {
  ATTRIBUTION_SYSTEM_PROMPT,
  ATTRIBUTION_TOOL_DESCRIPTION,
  ATTRIBUTION_TOOL_NAME,
  SCRIPT_TOOL_DESCRIPTION,
  SCRIPT_TOOL_NAME,
  SCRIPT_WRITER_SYSTEM_PROMPT,
  applyAttribution,
  buildAttributionPrompt,
  buildAttributionSchema,
  buildScriptSchema,
  buildScriptWriterPrompt,
  fallbackScript,
  parseWrittenScript,
  scriptFormatById,
  type ScriptPaceId,
  type WrittenScript
} from "@nodetool-ai/protocol";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import {
  useScriptStore,
  type ScriptDraft
} from "../../stores/script/ScriptStore";
import {
  clearScriptImport,
  getScriptImport,
  type ImportedScript
} from "../../lib/script/importedScript";

/** The length a script is written to when no step wrote one. */
export const DEFAULT_SCRIPT_SECONDS = 60;

const MAX_WRITER_TOKENS = 8192;

/** The script as the writer prompt reads it back. */
const asWritten = (script: ScriptDraft): WrittenScript => ({
  cast: script.cast.map((speaker) => ({ id: speaker.id, name: speaker.name })),
  sections: script.sections.map((section) => ({
    id: section.id,
    title: section.title ?? "",
    lines: section.lines.map((line) => ({
      id: line.id,
      speakerId: line.speakerId ?? null,
      text: line.text,
      direction: line.direction
    }))
  }))
});

const lineIdsOf = (script: ScriptDraft): string[] =>
  script.sections.flatMap((section) => section.lines.map((line) => line.id));

/** Imported lines applied as they are — the source already named the cast. */
function applyImportedAsIs(
  imported: ImportedScript,
  options: { idPrefix: string; lineIds: readonly string[]; sectionTitle: string }
): WrittenScript {
  const cast: Array<{ id: string; name: string }> = [];
  const byName = new Map<string, string>();
  imported.speakers.forEach((name, index) => {
    const id = `${options.idPrefix}_spk_${index + 1}`;
    cast.push({ id, name });
    byName.set(name.toLowerCase(), id);
  });
  return {
    cast,
    sections: [
      {
        id: `${options.idPrefix}_sec_1`,
        title: options.sectionTitle,
        lines: imported.lines.map((line, index) => ({
          id: options.lineIds[index] ?? `${options.idPrefix}_line_${index + 1}`,
          speakerId: byName.get(line.speakerName.toLowerCase()) ?? null,
          text: line.text,
          direction: line.direction,
          targetDurationMs: line.targetDurationMs
        }))
      }
    ]
  };
}

export interface WriteScriptOptions {
  /** True for the review step's `Rewrite`. */
  rewrite?: boolean;
}

export interface UseWriteScriptResult {
  /**
   * Write (or rewrite) the script. Resolves `true` when lines were applied and
   * `false` when the run was refused or the provider failed — the reason is in
   * {@link UseWriteScriptResult.error}. It never rejects, because the review
   * step fires it from a click handler; the setup flow reads the boolean and
   * turns a `false` into the message on its button.
   */
  write: (scriptId: string, options?: WriteScriptOptions) => Promise<boolean>;
  writing: boolean;
  error: string | null;
}

/**
 * Ids for one write. `Date.now()` alone is not enough: two writes inside the
 * same millisecond mint the same prefix, so a rewrite's new line can be handed
 * the id of a line that rewrite dropped — and with the id, that line's takes,
 * which are paid-for audio of different words. The counter is what makes each
 * write's ids its own, the way `ScriptStore`'s own id helper does it.
 */
let writeSequence = 0;
const nextIdPrefix = (): string =>
  `w${Date.now().toString(36)}${(writeSequence++).toString(36)}`;

export const useWriteScript = (): UseWriteScriptResult => {
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const write = useCallback(
    async (scriptId: string, options: WriteScriptOptions = {}) => {
      const store = useScriptStore.getState();
      const script = store.getScript(scriptId);
      if (!script) {
        setError("This script is not open.");
        return false;
      }
      const setup = script.setup ?? null;
      // A rewrite gives the import up, so this and every later run write from
      // the script the creator actually has in front of them.
      if (options.rewrite === true) {
        clearScriptImport(scriptId);
      }
      const imported = getScriptImport(scriptId);
      const brief = setup?.brief.trim() ?? "";
      if (brief === "" && !imported && lineIdsOf(script).length === 0) {
        setError("Write a brief before writing the script.");
        return false;
      }

      const model = useGlobalChatStore.getState().selectedModel;
      if (!model?.id) {
        setError("Pick a model before writing the script.");
        return false;
      }

      const format = setup?.format ?? "";
      const pace = (setup?.pace ?? "normal") as ScriptPaceId;
      const lengthSeconds = setup?.length_seconds ?? DEFAULT_SCRIPT_SECONDS;
      const sectionTitle = scriptFormatById(format)?.sections[0] ?? "Script";
      const idPrefix = nextIdPrefix();
      const heldLineIds = lineIdsOf(script);

      setError(null);
      setWriting(true);
      try {
        let written: WrittenScript;

        if (imported?.attributed) {
          written = applyImportedAsIs(imported, {
            idPrefix,
            lineIds: heldLineIds,
            sectionTitle
          });
        } else if (imported) {
          const texts = imported.lines.map((line) => line.text);
          const answer = await rpcRequest("generate_text", {
            provider: model.provider,
            model: model.id,
            system: ATTRIBUTION_SYSTEM_PROMPT,
            prompt: buildAttributionPrompt(texts, { brief, format }),
            max_tokens: MAX_WRITER_TOKENS,
            schema: buildAttributionSchema(texts.length),
            schema_name: ATTRIBUTION_TOOL_NAME,
            schema_description: ATTRIBUTION_TOOL_DESCRIPTION
          });
          written = applyAttribution(texts, answer.data, {
            idPrefix,
            lineIds: heldLineIds,
            sectionTitle,
            existingCast: asWritten(script).cast
          });
        } else {
          const input = {
            brief,
            format,
            lengthSeconds,
            pace,
            language: setup?.language,
            existing: options.rewrite ? asWritten(script) : undefined
          };
          const answer = await rpcRequest("generate_text", {
            provider: model.provider,
            model: model.id,
            system: SCRIPT_WRITER_SYSTEM_PROMPT,
            prompt: buildScriptWriterPrompt(input),
            max_tokens: MAX_WRITER_TOKENS,
            schema: buildScriptSchema({ retainIds: heldLineIds }),
            schema_name: SCRIPT_TOOL_NAME,
            schema_description: SCRIPT_TOOL_DESCRIPTION
          });
          const parseOptions = {
            idPrefix,
            retainIds: heldLineIds,
            existingCast: asWritten(script).cast
          };
          const parsed = parseWrittenScript(answer.data, parseOptions);
          // A provider that ignores the schema — or the fake one — falls back
          // to the brief split into lines, the same rule the Director applies,
          // so the creator lands on a review they can edit rather than an
          // error. Only a provider failure throws.
          written =
            parsed.sections.length > 0
              ? parsed
              : fallbackScript(input, parseOptions);
        }

        store.applyWrittenScript(scriptId, written);
        // Only a run that was waiting for its script moves the stage on: the
        // review's `Rewrite` fires the same call and must not throw the
        // creator back a step.
        if (useScriptStore.getState().getScript(scriptId)?.setup?.stage === "format") {
          store.setSetup(scriptId, { stage: "review" });
        }
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        setWriting(false);
      }
    },
    []
  );

  return { write, writing, error };
};

export default useWriteScript;
