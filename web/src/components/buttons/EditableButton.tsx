import { useCallback, useRef, useEffect, useState } from "react";
import TextField from "@mui/material/TextField";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { devLog } from "../../utils/DevLog";
import { MenuItem } from "@mui/material";
import { useNodes } from "../../contexts/NodeContext";

type EditWorkflowButtonProps = {
  workflow: Workflow;
  selected: boolean;
  onClick: () => void;
};

function EditWorkflowButton({
  workflow,
  onClick,
  selected
}: EditWorkflowButtonProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [workflowName, setWorkflowName] = useState(workflow.name);
  const updateWorkflow = useWorkflowStore((state) => state.update);
  const { updateFromWorkflowStore } = useNodes((state) => ({
    updateFromWorkflowStore: state.updateFromWorkflowStore
  }));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const saveWorkflow = useCallback(() => {
    updateWorkflow({ ...workflow, name: workflowName }).then(() => {
      devLog("Workflow updated");
      updateFromWorkflowStore().then(() => {
        devLog("Node store updated");
      });
    });
  }, [updateWorkflow, workflow, workflowName, updateFromWorkflowStore]);

  return (
    <MenuItem
      selected={selected}
      onClick={onClick}
      onDoubleClick={() => !isEditing && setIsEditing(true)}
    >
      {isEditing ? (
        <TextField
          className="editable-text"
          InputProps={{
            inputRef: inputRef
          }}
          value={workflowName}
          variant="filled"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setIsEditing(false);
              setTimeout(saveWorkflow, 10);
            }
          }}
          onChange={(e) => setWorkflowName(e.target.value)}
          onBlur={() => {
            setIsEditing(false);
            saveWorkflow();
          }}
          autoFocus
        />
      ) : (
        workflow.name
      )}
    </MenuItem>
  );
}

export default EditWorkflowButton;
