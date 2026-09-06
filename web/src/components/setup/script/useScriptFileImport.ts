/**
 * Step 1's two import paths (PRD § 9.1).
 *
 * `Paste or upload text` takes TXT, PDF, DOCX and FDX. PDF and DOCX go to
 * `POST /api/documents/extract-text` — pdfium and mammoth are Node-only and
 * the browser never bundles them — while FDX, TXT and the subtitle formats are
 * read in the browser, since XML and plain text need no server. Every one of
 * them becomes a source through `importedFromFile`, so a file picked here and a
 * file the project composer carries in are read by the same rule.
 *
 * Whatever the path, the words land on the document as `setup.source`, and the
 * writer step then splits and attributes them rather than rewriting them
 * (§ 9.2, criterion 4). They are not the brief: the brief says what to write,
 * the source is what must survive writing, and an import replaces only the
 * source (F3). A refused file writes nothing.
 */

import { useCallback, useState } from "react";

import { restFetch } from "../../../lib/rest-fetch";
import { useScriptStore } from "../../../stores/script/ScriptStore";
import {
  importedFromFile,
  importedFromText,
  scriptSourcePatch,
  type ImportedScript
} from "../../../lib/script/importedScript";

/** What the text picker offers. TXT and FDX never reach the route. */
export const SCRIPT_TEXT_ACCEPT = ".txt,.pdf,.docx,.fdx,application/pdf,text/plain";

/** What the subtitle picker offers. */
export const SCRIPT_SUBTITLE_ACCEPT = ".srt,.vtt,text/vtt";

const UNSUPPORTED = "Unsupported file type. Upload a TXT, PDF, DOCX or FDX.";

/** Mirrors `EXTRACT_TEXT_MAX_BYTES` on the route, so an oversize file is
 *  refused before it is uploaded. */
export const SCRIPT_MAX_BYTES = 25 * 1024 * 1024;

const endsWith = (file: File, ...extensions: string[]): boolean =>
  extensions.some((extension) => file.name.toLowerCase().endsWith(extension));

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

export interface ScriptFileImportResult {
  importing: boolean;
  error: string | null;
  clearError: () => void;
  /** Reads a TXT, PDF, DOCX or FDX onto the script. Never throws. */
  importText: (file: File) => Promise<void>;
  /** Reads an SRT or VTT onto the script. Never throws. */
  importSubtitles: (file: File) => Promise<void>;
  /** Records pasted text as an import, so the writer keeps it verbatim. */
  pasteText: (text: string) => void;
}

export function useScriptFileImport(scriptId: string): ScriptFileImportResult {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(
    (imported: ImportedScript) => {
      useScriptStore.getState().setSetup(scriptId, scriptSourcePatch(imported));
    },
    [scriptId]
  );

  const tooLarge = useCallback((file: File): boolean => {
    if (file.size <= SCRIPT_MAX_BYTES) {
      return false;
    }
    setError(
      `File is too large. The limit is ${Math.floor(SCRIPT_MAX_BYTES / (1024 * 1024))} MB.`
    );
    return true;
  }, []);

  const importText = useCallback(
    async (file: File): Promise<void> => {
      setError(null);
      if (tooLarge(file)) return;
      setImporting(true);
      try {
        if (endsWith(file, ".fdx", ".txt")) {
          apply(importedFromFile(file.name, await file.text()));
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
        apply(importedFromText(text));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : UNSUPPORTED);
      } finally {
        setImporting(false);
      }
    },
    [apply, tooLarge]
  );

  const importSubtitles = useCallback(
    async (file: File): Promise<void> => {
      setError(null);
      if (tooLarge(file)) return;
      setImporting(true);
      try {
        apply(importedFromFile(file.name, await file.text()));
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "This subtitle file could not be read."
        );
      } finally {
        setImporting(false);
      }
    },
    [apply, tooLarge]
  );

  const pasteText = useCallback(
    (text: string) => {
      if (text.trim() === "") return;
      apply(importedFromText(text));
    },
    [apply]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    importing,
    error,
    clearError,
    importText,
    importSubtitles,
    pasteText
  };
}

export default useScriptFileImport;
