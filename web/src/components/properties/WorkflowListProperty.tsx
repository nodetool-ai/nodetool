import { memo, useCallback } from "react";
import { OutlinedInput, SelectChangeEvent } from "@mui/material";
import { WorkflowList } from "../../stores/ApiTypes";
import PropertyLabel from "../node/PropertyLabel";
import { useQuery } from "@tanstack/react-query";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeSelect, NodeMenuItem } from "../editor_ui";

const WorkflowListProperty = (props: PropertyProps) => {
  const id = `workflow-list-${props.property.name}-${props.propertyIndex}`;
  const workflowIds: string[] = props.value?.map((workflow: { id: string }) => workflow.id) || [];
  const load = useWorkflowManager((state) => state.load);

  const { data, error, isLoading } = useQuery<WorkflowList, Error>({
    queryKey: ["workflows"],
    queryFn: async () => {
      return await load("", 200);
    }
  });

  const findWorkflow = useCallback(
    (id: string) => {
      if (data?.workflows === undefined) {return { name: "" };}
      return (
        data.workflows.find((workflow) => workflow.id === id) || { name: "" }
      );
    },
    [data]
  );

  const handleChange = useCallback(
    (e: SelectChangeEvent<unknown>) => {
      const ids = e.target.value as string[];
      props.onChange(ids.map((id) => ({ type: "workflow", id })));
    },
    [props]
  );

  const renderSelectedValue = useCallback(
    (selected: unknown) => {
      const ids = selected as string[];
      return ids.map((id: string) => findWorkflow(id).name).join(", ");
    },
    [findWorkflow]
  );

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <NodeSelect
        id={id}
        multiple
        value={workflowIds}
        onChange={handleChange}
        input={<OutlinedInput id="select-multiple-chip" label="Chip" />}
        renderValue={renderSelectedValue}
      >
        {isLoading && <NodeMenuItem disabled>Loading...</NodeMenuItem>}
        {error && <NodeMenuItem disabled>Error: {error.message}</NodeMenuItem>}
        {data?.workflows &&
          data.workflows.map((workflow) => (
            <NodeMenuItem key={workflow.id} value={workflow.id}>
              {workflow.name}
            </NodeMenuItem>
          ))}
      </NodeSelect>
    </>
  );
};

export default memo(WorkflowListProperty, isEqual);
