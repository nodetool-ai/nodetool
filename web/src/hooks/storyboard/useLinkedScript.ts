/**
 * useLinkedScript
 *
 * The script a board links, read for the board's own surfaces: the shot
 * inspector's Script section and the drift badge. The live editor draft wins
 * when the script's tab is open — that is what a re-projection would carry —
 * and the server copy fills in when it is not.
 *
 * Voicing writes into the script store, and only an open script tab saves it,
 * so `draftLoaded` reports whether the board may offer that action.
 */

import { useMemo } from "react";
import type { scripts } from "@nodetool-ai/protocol/api-schemas";

import { trpc } from "../../trpc/client";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useScriptStore } from "../../stores/script/ScriptStore";
import {
  draftProjectionSource,
  linkedScriptId,
  projectionSource,
  type ScriptProjectionSource
} from "../../lib/scriptStoryboardLink";

export interface LinkedScript {
  scriptId: string | null;
  /** Null until the script document has arrived. */
  source: ScriptProjectionSource | null;
  /** True when the script's editor tab is open, so its store draft saves. */
  draftLoaded: boolean;
}

const UNLINKED: LinkedScript = {
  scriptId: null,
  source: null,
  draftLoaded: false
};

export const useLinkedScript = (boardId: string): LinkedScript => {
  const scriptId = useStoryboardStore((state) =>
    linkedScriptId(state.boards[boardId])
  );
  const draft = useScriptStore((state) =>
    scriptId ? state.scripts[scriptId] : undefined
  );
  const { data } = trpc.scripts.get.useQuery(
    { id: scriptId ?? "" },
    { enabled: !!scriptId && !draft, staleTime: 30_000, retry: false }
  );
  const document: scripts.ScriptDocumentSchema | undefined = data?.document;

  return useMemo(() => {
    if (!scriptId) {
      return UNLINKED;
    }
    if (draft) {
      return {
        scriptId,
        source: draftProjectionSource(draft),
        draftLoaded: true
      };
    }
    return {
      scriptId,
      source: document ? projectionSource(document) : null,
      draftLoaded: false
    };
  }, [scriptId, draft, document]);
};

export default useLinkedScript;
