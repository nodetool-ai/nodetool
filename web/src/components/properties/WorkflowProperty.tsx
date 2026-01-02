import { WorkflowList } from "../../stores/ApiTypes";
import PropertyLabel from "../node/PropertyLabel";
import { useQuery } from "@tanstack/react-query";
import { PropertyProps } from "../node/PropertyInput";
import { memo } from "react";
import isEqual from "lodash/isEqual";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeSelect, NodeMenuItem } from "../editor_ui";

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
      <NodeSelect
        id={id}
        labelId={id}
        name=""
        value={props.value?.id || ""}
        onChange={(e) =>
          props.onChange({
            type: "workflow",
            id: e.target.value
          })
        }
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

export default memo(WorkflowProperty, isEqual);
