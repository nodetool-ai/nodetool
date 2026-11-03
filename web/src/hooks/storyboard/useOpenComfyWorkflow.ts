import { useCallback, useState } from "react";

import { trpcClient } from "../../trpc/client";
import type { Workflow } from "../../stores/ApiTypes";
import { useWorkflowActions } from "../useWorkflowActions";
import {
  comfyWorkflowExampleName,
  findComfyWorkflowExample
} from "../../lib/storyboard/comfyWorkflowModel";

interface OpenComfyWorkflow {
  /** Resolves true once the editable copy is open in a tab. */
  open: () => Promise<boolean>;
  opening: boolean;
  error: string | null;
}

/**
 * Opens an editable copy of the example that holds the same pinned ComfyUI
 * graph the storyboard's ComfyUI workflow clip model runs.
 */
export const useOpenComfyWorkflow = (modelId: string): OpenComfyWorkflow => {
  const { handleExampleClick } = useWorkflowActions();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    setOpening(true);
    setError(null);
    const name = comfyWorkflowExampleName(modelId);
    if (!name) {
      setError("This model has no editable example workflow.");
      setOpening(false);
      return false;
    }
    try {
      const found = (await trpcClient.workflows.examples.query({
        query: name
      })) as { workflows: Workflow[] };
      const example = findComfyWorkflowExample(found.workflows ?? [], name);
      if (!example) {
        setError(`The "${name}" example is not installed.`);
        return false;
      }
      await handleExampleClick(example);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setOpening(false);
    }
  }, [handleExampleClick, modelId]);

  return { open, opening, error };
};
