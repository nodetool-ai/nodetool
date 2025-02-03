import { Select } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import { WorkflowList } from "../../stores/ApiTypes";
import { useQuery } from "@tanstack/react-query";
import { memo } from "react";
import { isEqual } from "lodash";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

interface WorkflowSelectProps {
  id: string;
  value?: { id: string };
  onChange: (value: { type: "workflow"; id: string }) => void;
}

const WorkflowSelect = (props: WorkflowSelectProps) => {
  const { load } = useWorkflowManager((state) => ({
    load: state.load
  }));

  const { data, error, isLoading } = useQuery<WorkflowList, Error>({
    queryKey: ["workflows"],
    queryFn: async () => {
      return await load();
    }
  });

  return (
    <Select
      id={props.id}
      labelId={props.id}
      name=""
      value={props.value?.id || ""}
      variant="standard"
      onChange={(e) =>
        props.onChange({
          type: "workflow",
          id: e.target.value
        })
      }
      className="mui-select nodrag"
      disableUnderline={true}
      MenuProps={{
        anchorOrigin: {
          vertical: "bottom",
          horizontal: "left"
        },
        transformOrigin: {
          vertical: "top",
          horizontal: "left"
        }
      }}
    >
      {isLoading && <MenuItem disabled>Loading...</MenuItem>}
      {error && <MenuItem disabled>Error: {error.message}</MenuItem>}
      {data?.workflows &&
        data.workflows.map((workflow) => (
          <MenuItem key={workflow.id} value={workflow.id}>
            {workflow.name}
          </MenuItem>
        ))}
    </Select>
  );
};

export default memo(WorkflowSelect, isEqual);
