import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Workflow } from "../stores/ApiTypes";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";

export const useWorkflowActions = () => {
  const navigate = useNavigate();
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const createWorkflow = useWorkflowManager((state) => state.create);
  const [loadingExampleId, setLoadingExampleId] = useState<string | null>(null);

  const handleCreateNewWorkflow = useCallback(async () => {
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
          example.package_name || undefined,
          example.name
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
    navigate("/templates");
  }, [navigate]);

  return {
    loadingExampleId,
    handleCreateNewWorkflow,
    handleWorkflowClick,
    handleExampleClick,
    handleViewAllTemplates
  };
};
