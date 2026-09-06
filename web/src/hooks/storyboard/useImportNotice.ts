/**
 * The review step's subscription to what the import post-check found
 * (PRD § 7.2, D10). The notice is written by the Director run and read one
 * step later, so this re-renders the review when a `Re-direct` changes it.
 */

import { useCallback, useSyncExternalStore } from "react";

import {
  getImportNotice,
  subscribeToImports,
  type ImportNotice
} from "../../lib/storyboard/importSource";

export function useImportNotice(boardId: string): ImportNotice | undefined {
  return useSyncExternalStore(
    subscribeToImports,
    useCallback(() => getImportNotice(boardId), [boardId])
  );
}

export default useImportNotice;
