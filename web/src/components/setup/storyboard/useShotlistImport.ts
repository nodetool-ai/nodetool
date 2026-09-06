/**
 * Step 1's `Import your shotlist` path (PRD § 7.1, § 7.7.8).
 *
 * A shotlist is already a plan, so the import skips the Director entirely: the
 * rows become scenes and shots, the board goes to stage `look`, and step 3
 * asks only for the aspect ratio and the style. Whatever the file could not
 * give — an unreadable duration, a vocabulary value that is not one of the
 * options, a row with no description — is shown as a report rather than
 * failing the file.
 *
 * A file whose every value was accepted has nothing to resolve, so it does not
 * stop on a dialog: the rows are already on the board, the stage moves at
 * once, and step 3 carries the import summary inline (F29). A file that
 * discarded something shows the report first, because those rows are the
 * creator's to fix and step 1 is where the file was picked. Either way the
 * summary is kept for step 3, so closing the dialog is not the only chance to
 * read it.
 */

import { useCallback, useState } from "react";
import type { Screenplay } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { clearImport } from "../../../lib/storyboard/importSource";
import { setShotlistImport } from "./setupChoices";
import {
  parseShotlistCsv,
  type ShotlistReportEntry
} from "../../../lib/storyboard/parseShotlistCsv";

/** What the file picker offers. */
export const SHOTLIST_ACCEPT = ".csv,text/csv";

/** The template `Download template` serves, from the web public folder. */
export const SHOTLIST_TEMPLATE_URL = "/storyboard-shotlist-template.csv";

export interface ShotlistImportResult {
  importing: boolean;
  error: string | null;
  /** Set on a successful import, including when nothing was discarded. */
  report: ShotlistReportEntry[] | null;
  shotCount: number;
  clearError: () => void;
  /** Closes the report and moves the flow to step 3. */
  dismissReport: () => void;
  importFile: (file: File) => Promise<void>;
}

export function useShotlistImport(boardId: string): ShotlistImportResult {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ShotlistReportEntry[] | null>(null);
  const [shotCount, setShotCount] = useState(0);

  const importFile = useCallback(
    async (file: File): Promise<void> => {
      setError(null);
      setReport(null);
      setImporting(true);
      try {
        const parsed = parseShotlistCsv(await file.text());
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        if (parsed.result.shots.length === 0) {
          setError("This CSV holds no shots to import.");
          return;
        }
        const screenplay: Screenplay = {
          type: "screenplay",
          id: `csv-${boardId}`,
          title: "",
          shots: parsed.result.shots,
          scenes: parsed.result.scenes
        };
        const store = useStoryboardStore.getState();
        store.setScreenplay(boardId, screenplay);
        // The rows are the plan, so there is nothing for the Director to
        // structure and no post-check to run on this board.
        clearImport(boardId);
        setShotCount(parsed.result.shots.length);
        // Step 3 reads it back, so the summary outlives the dialog and the
        // remount that moving the stage causes.
        setShotlistImport(boardId, {
          shotCount: parsed.result.shots.length,
          entries: parsed.result.report
        });
        if (parsed.result.report.length === 0) {
          store.setSetup(boardId, { stage: "look" });
          return;
        }
        setReport(parsed.result.report);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "This CSV could not be read."
        );
      } finally {
        setImporting(false);
      }
    },
    [boardId]
  );

  return {
    importing,
    error,
    report,
    shotCount,
    clearError: useCallback(() => setError(null), []),
    dismissReport: useCallback(() => {
      setReport(null);
      useStoryboardStore.getState().setSetup(boardId, { stage: "look" });
    }, [boardId]),
    importFile
  };
}

export default useShotlistImport;
