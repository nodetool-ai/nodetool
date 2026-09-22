import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Workflow } from "../stores/ApiTypes";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useOnboardingStore from "../stores/OnboardingStore";
import {
  examplePackageName,
  exampleSeedRef
} from "../utils/exampleWorkflow";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";

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
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const [loadingExampleId, setLoadingExampleId] = useState<string | null>(null);

  const handleCreateNewWorkflow = useCallback(async () => {
    const workflow = await createNewWorkflow();
    navigate(`/editor/${workflow.id}`);
    useOnboardingStore.getState().markStep("keep-creating");
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
        openTab({
          type: "workflow",
          ref: newWorkflow.id,
          mode: "view",
          title: newWorkflow.name || example.name
        });
        navigate("/workspace");
        useOnboardingStore.getState().markStep("keep-creating");
      } catch (error) {
        console.error("Error copying example:", error);
        setLoadingExampleId(null);
      }
    },
    [loadingExampleId, createWorkflow, navigate, openTab]
  );

  const handleViewAllTemplates = useCallback(() => {
    navigate("/examples");
  }, [navigate]);

  return {
    loadingExampleId,
    handleCreateNewWorkflow,
    handleWorkflowClick,
    handleExampleClick,
    handleViewAllTemplates
  };
};
