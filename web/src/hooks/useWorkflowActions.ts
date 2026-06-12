import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Workflow } from "../stores/ApiTypes";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useOnboardingStore from "../stores/OnboardingStore";
import {
  examplePackageName,
  exampleSeedRef
} from "../utils/exampleWorkflow";

/**
 * Custom hook for workflow-related actions and navigation.
 * 
 * Provides handlers for creating new workflows, opening existing workflows,
 * and copying example workflows. Integrates with the workflow manager
 * and React Router for navigation.
 * 
 * @returns Object containing workflow action handlers and loading state
 * 
 * @example
 * ```typescript
 * const { handleCreateNewWorkflow, handleWorkflowClick } = useWorkflowActions();
 * 
 * // Create a new workflow
 * await handleCreateNewWorkflow();
 * 
 * // Open an existing workflow
 * handleWorkflowClick(existingWorkflow);
 * ```
 */
interface WorkflowActions {
  loadingExampleId: string | null;
  handleCreateNewWorkflow: () => Promise<void>;
  handleWorkflowClick: (workflow: Workflow) => void;
  handleExampleClick: (example: Workflow) => Promise<void>;
  handleViewAllTemplates: () => void;
}

export const useWorkflowActions = (): WorkflowActions => {
  const navigate = useNavigate();
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const createWorkflow = useWorkflowManager((state) => state.create);
  const [loadingExampleId, setLoadingExampleId] = useState<string | null>(null);

  const handleCreateNewWorkflow = useCallback(async () => {
    useOnboardingStore.getState().markStep("create-workflow");
    const workflow = await createNewWorkflow();
    navigate(`/editor/${workflow.id}`);
  }, [createNewWorkflow, navigate]);

  const handleWorkflowClick = useCallback(
    (workflow: Workflow) => {
      navigate(`/editor/${workflow.id}`);
    },
    [navigate]
  );

  const handleExampleClick = useCallback(
    async (example: Workflow) => {
      if (loadingExampleId) {return;}

      useOnboardingStore.getState().markStep("open-template");
      setLoadingExampleId(example.id);
      try {
        const tags = example.tags || [];
        if (!tags.includes("example")) {
          tags.push("example");
        }

        const req = {
          name: example.name,
          package_name: example.package_name,
          description: example.description,
          tags: tags,
          access: "private",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const newWorkflow = await createWorkflow(
          req,
          examplePackageName(example),
          exampleSeedRef(example)
        );
        navigate(`/editor/${newWorkflow.id}`);
      } catch (error) {
        console.error("Error copying example:", error);
        setLoadingExampleId(null);
      }
    },
    [loadingExampleId, createWorkflow, navigate]
  );

  const handleViewAllTemplates = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  return {
    loadingExampleId,
    handleCreateNewWorkflow,
    handleWorkflowClick,
    handleExampleClick,
    handleViewAllTemplates
  };
};
