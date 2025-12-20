import { Select } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import { WorkflowList } from "../../stores/ApiTypes";
import PropertyLabel from "../node/PropertyLabel";
import { useQuery } from "@tanstack/react-query";
import { PropertyProps } from "../node/PropertyInput";
import { memo } from "react";
import isEqual from "lodash/isEqual";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
const WorkflowProperty = (props: PropertyProps) => {
  const id = `workflow-${props.property.name}-${props.propertyIndex}`;
  const load = useWorkflowManager((state) => state.load);

  const { data, error, isLoading } = useQuery<WorkflowList, Error>({
    queryKey: ["workflows"],
    queryFn: async () => {
      return await load("", 200);
    }
  });

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Select
        id={id}
        labelId={id}
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
    </>
  );
};

export default memo(WorkflowProperty, isEqual);
