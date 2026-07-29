/**
 * useExtractScript
 *
 * The timeline → script handoff: projects a sequence's transcript into a new
 * script resource, seeds the store, and opens the script tab. The pure mapping
 * lives in {@link buildScriptFromTimeline}.
 */

import { useCallback, useState } from "react";
import { trpcClient } from "../../trpc/client";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { buildScriptFromTimeline } from "../../components/script/extractScript";
import type { TimelineClip } from "@nodetool-ai/timeline";

export interface ExtractScriptResult {
  scriptId: string;
  lineCount: number;
}

export interface UseExtractScriptResult {
  extract: (timelineId: string) => Promise<ExtractScriptResult>;
  extracting: boolean;
  error: string | null;
}

export const useExtractScript = (): UseExtractScriptResult => {
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = useCallback(
    async (timelineId: string): Promise<ExtractScriptResult> => {
      setError(null);
      setExtracting(true);
      try {
        const sequence = await trpcClient.timeline.get.query({
          id: timelineId
        });
        const extracted = buildScriptFromTimeline(
          sequence.clips as TimelineClip[]
        );
        const lineCount = extracted.sections.reduce(
          (n, s) => n + s.lines.length,
          0
        );
        if (lineCount === 0) {
          const message =
            "This timeline has no transcript to extract — add captioned or voiced clips first.";
          setError(message);
          throw new Error(message);
        }

        const name = `${sequence.name || "Timeline"} script`;
        const created = await trpcClient.scripts.create.mutate({
          name,
          projectId: sequence.projectId,
          // Persist the extracted content at creation so the tab's server-sync
          // reload (which happens on mount) reads it back instead of clobbering
          // the seeded store with an empty server document.
          document: {
            cast: extracted.cast,
            sections: extracted.sections
          } as Parameters<
            typeof trpcClient.scripts.create.mutate
          >[0]["document"]
        });
        useScriptStore.getState().loadScript(created.id, {
          title: name,
          cast: extracted.cast,
          sections: extracted.sections,
          timelineId: null
        });
        useScriptStore.getState().setServerRevision(created.id, created.updatedAt);
        useWorkspaceTabsStore.getState().openTab({
          type: "script",
          ref: created.id,
          mode: "edit",
          title: name
        });
        return { scriptId: created.id, lineCount };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setExtracting(false);
      }
    },
    []
  );

  return { extract, extracting, error };
};

export default useExtractScript;
