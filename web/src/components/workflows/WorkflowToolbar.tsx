import { FC, useCallback, useMemo } from "react";
import { Button, Typography, Tooltip, Select, MenuItem } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchInput from "../search/SearchInput";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import DeleteIcon from "@mui/icons-material/Delete";

interface WorkflowToolbarProps {
  workflows: Workflow[];
  setFilterValue: (value: string) => void;
  selectedTag: string;
  setSelectedTag: (tag: string) => void;
  showCheckboxes: boolean;
  toggleCheckboxes: () => void;
  selectedWorkflowsCount: number;
  onBulkDelete: () => void;
}

const WorkflowToolbar: FC<WorkflowToolbarProps> = ({
  workflows,
  selectedTag,
  setSelectedTag,
  setFilterValue,
  showCheckboxes,
  toggleCheckboxes,
  selectedWorkflowsCount,
  onBulkDelete
}) => {
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const uniqueTags = useMemo(() => {
    const tagSet = new Set<string>();
    workflows.forEach((wf) => wf.tags?.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet);
  }, [workflows]);

  const handleCreateWorkflow = useCallback(async () => {
    const workflow = await createNewWorkflow();
    queryClient.invalidateQueries({ queryKey: ["workflows"] });
    navigate(`/editor/${workflow.id}`);
  }, [navigate, createNewWorkflow, queryClient]);

  const handleSearchChange = useCallback((newSearchTerm: string) => {
    setFilterValue(newSearchTerm);
  }, []);

  return (
    <>
      <div className="workflow-header">
        <Typography variant="h3">Workflows</Typography>
      </div>
      <div className="tools">
        <Tooltip
          title={`${showCheckboxes ? "Hide" : "Show"} selection checkboxes`}
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <Button onClick={toggleCheckboxes}>
            <CheckBoxIcon />
          </Button>
        </Tooltip>
        <Tooltip title="Create a new workflow">
          <Button variant="outlined" onClick={handleCreateWorkflow}>
            <AddIcon />
          </Button>
        </Tooltip>

        <Tooltip title="Search workflows by name">
          <div>
            <SearchInput
              onSearchChange={handleSearchChange}
              focusSearchInput={false}
            />
          </div>
        </Tooltip>

        <Tooltip title="Filter workflows by tag">
          <Select
            id="tag-filter"
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {uniqueTags.map((tag) => (
              <MenuItem key={tag} value={tag}>
                {tag}
              </MenuItem>
            ))}
          </Select>
        </Tooltip>

        {selectedWorkflowsCount > 0 && (
          <Tooltip
            title={`Delete ${selectedWorkflowsCount} selected workflow${
              selectedWorkflowsCount > 1 ? "s" : ""
            }`}
          >
            <Button
              variant="outlined"
              className="delete-selected-button"
              onClick={onBulkDelete}
            >
              <DeleteIcon />
            </Button>
          </Tooltip>
        )}
      </div>
    </>
  );
};

export default WorkflowToolbar;
