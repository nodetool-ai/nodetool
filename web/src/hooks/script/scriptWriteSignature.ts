/**
 * What the script in the review was written from (F15).
 *
 * Step 2's button ran the writer every time it was pressed, so a creator who
 * stepped back from the review to look at the format cards and pressed on paid
 * for a second script and lost the edits they had made to the first. The fix is
 * to remember the inputs each write consumed: press the button with the same
 * brief, format, length, language, model and source, and there is nothing to
 * write — the script the creator is going back to is already the answer.
 *
 * Pace is not one of those inputs. It is picked on the Voices step, after the
 * words exist, and reaches the speech calls as a speed. Counting it here made
 * a voicing choice read as a changed script, so going back offered a full
 * rewrite that dropped the creator's edits (O4).
 *
 * The signature is a string on the document rather than a copy of the inputs,
 * because nothing needs to read the old values back, only to know whether they
 * moved.
 */

import type { ScriptSetup } from "@nodetool-ai/protocol/api-schemas/scripts.js";

import {
  scriptSourceSignature,
  type ImportedScript
} from "../../lib/script/importedScript";

/** The `setup` key the signature is written under. */
const WRITTEN_FROM_FIELD = "written_from";

/** The inputs the writer reads, as one comparable string. */
export function writerSignature(
  setup: ScriptSetup | null | undefined,
  source: ImportedScript | null
): string {
  // An attributed import is applied as it is: the brief, the length and the
  // model never reach it, only the format's section title does. Counting them
  // made a changed length offer to prepare the import again, which drops the
  // edits made in the review.
  if (source?.attributed === true) {
    return [
      "",
      setup?.format ?? "",
      "",
      "",
      "",
      "",
      scriptSourceSignature(source) ?? ""
    ].join("\u0001");
  }
  return allInputsSignature(setup, source);
}

/** Every input, as signatures were written before attributed imports
 * dropped the ones they never read. */
function allInputsSignature(
  setup: ScriptSetup | null | undefined,
  source: ImportedScript | null
): string {
  return [
    setup?.brief.trim() ?? "",
    setup?.format ?? "",
    String(setup?.length_seconds ?? ""),
    // An attributed import is applied as it is, so language never reaches it.
    source?.attributed === true ? "" : (setup?.language ?? ""),
    // The slot pace used to fill stays empty, so a signature written before
    // pace left it, while pace was still unset, keeps matching.
    "",
    setup?.writer_model?.id ?? "",
    scriptSourceSignature(source) ?? ""
  ].join("\u0001");
}

/**
 * True when the lines on the document answer these inputs. A signature
 * written before the attributed rule still matches on unchanged inputs.
 */
export function isWrittenFrom(
  setup: ScriptSetup | null | undefined,
  source: ImportedScript | null
): boolean {
  const written = readWriterSignature(setup);
  return (
    written === writerSignature(setup, source) ||
    (source?.attributed === true &&
      written === allInputsSignature(setup, source))
  );
}

/** The signature of the write that produced the lines now on the document. */
export function readWriterSignature(
  setup: ScriptSetup | null | undefined
): string | null {
  const raw = setup?.[WRITTEN_FROM_FIELD];
  return typeof raw === "string" ? raw : null;
}

export function writerSignaturePatch(signature: string): Partial<ScriptSetup> {
  return { [WRITTEN_FROM_FIELD]: signature };
}
