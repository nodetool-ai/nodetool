import { useCallback, useState } from "react";

import { trpcClient } from "../../trpc/client";
import type { Workflow } from "../../stores/ApiTypes";
import { useWorkflowActions } from "../useWorkflowActions";
import {
  COMFY_WORKFLOW_EXAMPLE_NAME,
  findComfyWorkflowExample
} from "../../lib/storyboard/comfyWorkflowModel";

interface OpenComfyWorkflow {
  open: () => Promise<void>;
  opening: boolean;
  error: string | null;
}

/**
 * Opens an editable copy of the Shot Director example, which holds the same
 * pinned ComfyUI graph the storyboard's ComfyUI workflow clip model runs.
 */
export const useOpenComfyWorkflow = (): OpenComfyWorkflow => {
  const { handleExampleClick } = useWorkflowActions();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    setOpening(true);
    setError(null);
    try {
      const found = (await trpcClient.workflows.examples.query({
        query: COMFY_WORKFLOW_EXAMPLE_NAME
      })) as { workflows: Workflow[] };
      const example = findComfyWorkflowExample(found.workflows ?? []);
      if (!example) {
        setError(`The "${COMFY_WORKFLOW_EXAMPLE_NAME}" example is not installed.`);
        return;
      }
      await handleExampleClick(example);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpening(false);
    }
  }, [handleExampleClick]);

  return { open, opening, error };
};
