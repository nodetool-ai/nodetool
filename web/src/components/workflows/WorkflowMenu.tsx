import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
//store
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useNodeStore } from "../../stores/NodeStore";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";

//mui
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  Menu,
  MenuItem,
  Typography
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";

//css
import ThemeNodetool from "../themes/ThemeNodetool";
import { useQuery } from "react-query";

type WorkflowMenuProps = {
  anchorEl: HTMLElement | null;
  onClose: () => void;
};

const WorkflowMenu = ({ anchorEl, onClose }: WorkflowMenuProps) => {
  const setShouldFitToScreen = useWorkflowStore(
    (state) => state.setShouldFitToScreen
  );
  const loadWorkflows = useWorkflowStore((state) => state.load);
  const setWorkflow = useNodeStore((state) => state.setWorkflow);
  const newWorkflow = useNodeStore((state) => state.newWorkflow);
  const workflow = useNodeStore((state) => state.workflow);
  const saveWorkflow = useNodeStore((state) => state.saveWorkflow);
  const navigate = useNavigate();

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const deleteWorkflow = useWorkflowStore().delete;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(
    null
  );
  const handleClose = () => setIsDeleteDialogOpen(false);

  const { data, isLoading, isError } = useQuery<WorkflowList, Error>(
    ["workflows"],
    async () => {
      return loadWorkflows("", 200);
    }
  );

  const selectWorkflow = useCallback(
    (workflow: Workflow) => {
      saveWorkflow();
      setWorkflow(workflow);
      navigate("/editor/" + workflow.id);
      setShouldFitToScreen(true);
    },
    [navigate, setShouldFitToScreen, setWorkflow, saveWorkflow]
  );

  // DELETE WORKFLOW
  const onDelete = (e: any, workflow: Workflow) => {
    e.stopPropagation();
    setWorkflowToDelete(workflow);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = useCallback(() => {
    if (!workflowToDelete) return;

    deleteWorkflow(workflowToDelete.id);
    setIsDeleteDialogOpen(false);
    addNotification({
      type: "success",
      content: `Workflow '${workflowToDelete.name}' deleted`,
      alert: true
    });
    setWorkflowToDelete(null);
  }, [deleteWorkflow, workflowToDelete, addNotification]);

  return (
    <>
      <Menu
        // keepMounted
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={onClose}
      >
        {isLoading && <MenuItem>Loading...</MenuItem>}
        {isError && <MenuItem>Error loading workflows</MenuItem>}
        {data?.workflows.map((w) => (
          <MenuItem
            selected={w.id === workflow.id}
            onClick={() => {
              selectWorkflow(w);
              onClose();
            }}
            key={w.id}
            sx={{
              paddingRight: 1,
              display: "flex",
              justifyContent: "space-between"
            }}
          >
            <Typography sx={{ marginRight: 2 }} fontSize="small">
              {w.name}
            </Typography>
            <Button onClick={(e) => onDelete(e, w)}>
              <ClearIcon />
            </Button>
          </MenuItem>
        ))}

        <hr style={{ marginTop: 0 }} />

        <Box sx={{ display: "flex" }}>
          <Button
            onClick={() => {
              newWorkflow();
              onClose();
            }}
            variant="outlined"
            sx={{ flexGrow: 1, marginLeft: 2, marginRight: 2 }}
          >
            Create Workflow
          </Button>
        </Box>
      </Menu>

      <Dialog
        open={isDeleteDialogOpen}
        onClose={handleClose}
        aria-labelledby="confirm-delete-workflow"
        aria-describedby="delete-workflow"
        style={{
          zIndex: 200000
        }}
        componentsProps={{
          backdrop: {
            style: {
              backgroundColor: "transparent"
            }
          }
        }}
      >
        <DialogTitle id="delete-workflow-title">
          <span style={{ color: ThemeNodetool.palette.c_white }}>
            Delete Workflow?
          </span>
        </DialogTitle>
        <DialogActions>
          <Button
            onClick={() => {
              setWorkflowToDelete(null);
              setIsDeleteDialogOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button className="delete" onClick={handleDelete} autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default WorkflowMenu;
