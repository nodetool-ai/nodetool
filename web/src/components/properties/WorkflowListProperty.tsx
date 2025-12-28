import { memo, useCallback } from "react";
import { OutlinedInput } from "@mui/material";
import { WorkflowList } from "../../stores/ApiTypes";
import PropertyLabel from "../node/PropertyLabel";
import { useQuery } from "@tanstack/react-query";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeSelect, NodeMenuItem } from "../editor_ui";

const WorkflowListProperty = (props: PropertyProps) => {
  const id = `workflow-list-${props.property.name}-${props.propertyIndex}`;
  const workflowIds = props.value?.map((workflow: any) => workflow.id);
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

  const onChange = useCallback(
    (workflowIds: string[]) => {
      props.onChange(workflowIds.map((id) => ({ type: "workflow", id })));
    },
    [props]
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
        value={workflowIds || []}
        onChange={(e) => onChange(e.target.value as string[])}
        input={<OutlinedInput id="select-multiple-chip" label="Chip" />}
        renderValue={(selected) =>
          (selected as string[]).map((id: string) => findWorkflow(id).name).join(", ")
        }
      >
        {isLoading && <NodeMenuItem disabled>Loading...</NodeMenuItem>}
        {error && <NodeMenuItem disabled>Error: {error.message}</NodeMenuItem>}
        {data?.workflows &&
          data.workflows.map((workflow: any) => (
            <NodeMenuItem key={workflow.id} value={workflow.id}>
              {workflow.name}
            </NodeMenuItem>
          ))}
      </NodeSelect>
    </>
  );
};

export default memo(WorkflowListProperty, isEqual);
