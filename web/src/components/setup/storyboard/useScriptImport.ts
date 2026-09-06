/**
 * Step 1's `Upload your file` path (PRD § 7.1, § 7.6, D16).
 *
 * PDF and DOCX go to `POST /api/documents/extract-text` — pdfium and mammoth
 * are Node-only and the browser never bundles them. FDX is XML, so it is
 * parsed here by `parseFdx` and its scenes and dialogue are written onto the
 * board: step 2 then directs camera work only and `verifyImportedText`
 * restores anything the answer changed (D10).
 *
 * A refused file writes nothing. The notices are the route's own words, so a
 * scanned PDF reads the same wherever it is refused.
 */

import { useCallback, useState } from "react";
import type { Screenplay } from "@nodetool-ai/protocol";

import { restFetch } from "../../../lib/rest-fetch";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { setImportSource } from "../../../lib/storyboard/importSource";
import { parseFdx } from "../../../lib/storyboard/parseFdx";

/** What the file picker offers. FDX never reaches the route. */
export const SCRIPT_ACCEPT = ".pdf,.docx,.fdx,application/pdf";

/** The § 7.6 wording for a file no importer reads. */
const UNSUPPORTED = "Unsupported file type. Upload a PDF, DOCX or FDX.";

/**
 * Mirrors `EXTRACT_TEXT_MAX_BYTES` on the route. Checked here so an oversize
 * file is refused before it is uploaded, as § 7.6 requires.
 */
export const SCRIPT_MAX_BYTES = 25 * 1024 * 1024;

const isFdx = (file: File): boolean =>
  file.name.toLowerCase().endsWith(".fdx");

/** The route's `{ code, detail }` body, or a status-only fallback. */
async function extractionError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { detail?: unknown }).detail === "string"
    ) {
      return (body as { detail: string }).detail;
    }
  } catch {
    // A body that is not JSON says nothing more than the status does.
  }
  return `This file could not be read. ${UNSUPPORTED}`;
}

export interface ScriptImportResult {
  importing: boolean;
  error: string | null;
  clearError: () => void;
  /** Reads one picked file onto the board. Never throws. */
  importFile: (file: File) => Promise<void>;
}

export function useScriptImport(boardId: string): ScriptImportResult {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFile = useCallback(
    async (file: File): Promise<void> => {
      setError(null);
      if (file.size > SCRIPT_MAX_BYTES) {
        setError(
          `File is too large. The limit is ${Math.floor(SCRIPT_MAX_BYTES / (1024 * 1024))} MB.`
        );
        return;
      }
      const store = useStoryboardStore.getState();
      setImporting(true);
      try {
        if (isFdx(file)) {
          const parsed = parseFdx(await file.text());
          const screenplay: Screenplay = {
            type: "screenplay",
            id: `fdx-${boardId}`,
            title: "",
            shots: parsed.shots,
            scenes: parsed.scenes
          };
          store.setSetup(boardId, { brief: parsed.text });
          store.setScreenplay(boardId, screenplay);
          setImportSource(boardId, { kind: "fdx", parsed });
          return;
        }

        const form = new FormData();
        form.append("file", file);
        const response = await restFetch("/api/documents/extract-text", {
          method: "POST",
          body: form
        });
        if (!response.ok) {
          setError(await extractionError(response));
          return;
        }
        const body: unknown = await response.json();
        const text =
          typeof body === "object" &&
          body !== null &&
          typeof (body as { text?: unknown }).text === "string"
            ? (body as { text: string }).text
            : "";
        if (text.trim() === "") {
          setError(`This file could not be read. ${UNSUPPORTED}`);
          return;
        }
        store.setSetup(boardId, { brief: text });
        // Plain text has no structure to keep, so the post-check only flags
        // the source lines the Director's shots left out (PRD § 7.2).
        setImportSource(boardId, { kind: "text", text });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : UNSUPPORTED);
      } finally {
        setImporting(false);
      }
    },
    [boardId]
  );

  const clearError = useCallback(() => setError(null), []);

  return { importing, error, clearError, importFile };
}

export default useScriptImport;
