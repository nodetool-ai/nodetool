import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { useTorchCatalog } from "../../serverState/useTorchCatalog";
import {
  Dialog,
  FlexColumn,
  Text,
  EditorButton,
  LoadingSpinner,
  GAP
} from "../ui_primitives";
import ErrorBanner from "../support/ErrorBanner";

interface CreateTorchWorkflowDialogProps {
  readonly projectId?: string;
  readonly onClose: () => void;
}

const CreateTorchWorkflowDialog = ({
  projectId,
  onClose
}: CreateTorchWorkflowDialogProps) => {
  const catalog = useTorchCatalog();
  const createNew = useWorkflowManager((state) => state.createNew);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async (templateId?: string) => {
    setCreating(true);
    setError("");
    try {
      const template = catalog.data?.templates.find(
        (item) => item.id === templateId
      );
      const scopedProjectId = projectId ?? creationProjectId();
      const workflow = await createNew(scopedProjectId, {
        name: template ? template.name : "Torch Workflow",
        graph: template?.graph ?? { nodes: [], edges: [] },
        settings: {
          execution: {
            kind: "torch",
            version: 1,
            target: "cpu",
            inputs: template?.exampleInputs ?? {}
          }
        }
      });
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      openTab({
        type: "workflow",
        ref: workflow.id,
        mode: "edit",
        title: workflow.name,
        projectId: scopedProjectId
      });
      navigate("/workspace");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  };

  const failure = error || catalog.error?.message;
  return (
    <Dialog
      open
      onClose={onClose}
      title="New Torch workflow"
      maxWidth="sm"
      fullWidth
    >
      <FlexColumn gap={GAP.normal}>
        <Text>
          Build a fixed-shape tensor graph for CPU or CUDA. Start from an
          example or an empty canvas.
        </Text>
        {catalog.isLoading && (
          <LoadingSpinner text="Loading Torch operations" />
        )}
        {failure && (
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "Could not create Torch workflow",
              errorText: failure
            }}
            onRetry={() => {
              void catalog.refetch();
            }}
          >
            {failure}
          </ErrorBanner>
        )}
        <EditorButton
          disabled={creating || !catalog.data}
          onClick={() => {
            void create();
          }}
        >
          Empty Torch workflow
        </EditorButton>
        {catalog.data?.templates.map((template) => (
          <EditorButton
            key={template.id}
            disabled={creating}
            onClick={() => {
              void create(template.id);
            }}
          >
            {template.name}
          </EditorButton>
        ))}
      </FlexColumn>
    </Dialog>
  );
};

export default CreateTorchWorkflowDialog;
