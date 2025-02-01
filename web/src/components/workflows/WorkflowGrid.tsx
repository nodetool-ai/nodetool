import { FC, useCallback, useMemo } from "react";
import { useResizeObserver } from "@mantine/hooks";
import { WorkflowListView } from "./WorkflowListView";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

interface WorkflowGridProps {
  workflows: Workflow[];
  selectedTag: string;
  onDelete: (workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  selectedWorkflows: string[];
  showCheckboxes: boolean;
}

const WorkflowGrid: FC<WorkflowGridProps> = ({
  workflows,
  selectedTag,
  onDelete,
  onSelect,
  selectedWorkflows,
  showCheckboxes
}) => {
  const [gridRef] = useResizeObserver();
  const { copyWorkflow, createWorkflow } = useWorkflowStore((state) => ({
    copyWorkflow: state.copy,
    createWorkflow: state.create
  }));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const finalWorkflows = useMemo(() => {
    if (!selectedTag) return workflows;
    return workflows.filter((wf) => wf.tags?.includes(selectedTag));
  }, [workflows, selectedTag]);

  const handleOpenWorkflow = useCallback(
    (workflow: Workflow) => {
      navigate("/editor/" + workflow.id);
    },
    [navigate]
  );

  const duplicateWorkflow = useCallback(
    async (event: React.MouseEvent, workflow: Workflow) => {
      event.stopPropagation();
      const workflowRequest = await copyWorkflow(workflow);
      const baseName = workflow.name.replace(/ \(\d+\)$/, "");
      const existingNames = workflows
        .filter((w) => w.name.startsWith(baseName))
        .map((w) => w.name);
      let highestNumber = 0;
      const regex = new RegExp(`^${baseName} \\((\\d+)\\)$`);
      existingNames.forEach((name) => {
        const match = name.match(regex);
        if (match && match[1]) {
          const number = parseInt(match[1], 10);
          if (number > highestNumber) {
            highestNumber = number;
          }
        }
      });
      const newName = `${baseName} (${highestNumber + 1})`;
      workflowRequest.name = newName.substring(0, 50);
      const newWorkflow = await createWorkflow(workflowRequest);
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      navigate(`/editor/${newWorkflow.id}`);
    },
    [copyWorkflow, createWorkflow, queryClient, workflows, navigate]
  );

  return (
    <div className="workflow-items" ref={gridRef}>
      <WorkflowListView
        workflows={finalWorkflows}
        onOpenWorkflow={handleOpenWorkflow}
        onDuplicateWorkflow={duplicateWorkflow}
        onDelete={onDelete}
        onSelect={onSelect}
        selectedWorkflows={selectedWorkflows}
        workflowCategory="user"
        showCheckboxes={showCheckboxes}
      />
    </div>
  );
};

export default WorkflowGrid;
