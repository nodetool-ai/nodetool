import { WorkflowList } from "../../stores/ApiTypes";
import PropertyLabel from "../node/PropertyLabel";
import { useQuery } from "@tanstack/react-query";
import { PropertyProps } from "../node/PropertyInput";
import { memo, useCallback } from "react";
import isEqual from "fast-deep-equal";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeSelect, NodeMenuItem } from "../editor_ui";

const WorkflowProperty = (props: PropertyProps) => {
  const { property, value, onChange } = props;
  const id = `workflow-${property.name}-${props.propertyIndex}`;
  const load = useWorkflowManager((state) => state.load);

  const { data, error, isLoading } = useQuery<WorkflowList, Error>({
    queryKey: ["workflows"],
    queryFn: async () => {
      return await load("", 200);
    }
  });

  // Memoize handler to prevent unnecessary re-renders of memoized NodeSelect child
  const handleChange = useCallback((e: any) => {
    onChange({
      type: "workflow",
      id: String(e.target.value)
    });
  }, [onChange]);

  return (
    <>
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <NodeSelect
        id={id}
        labelId={id}
        name=""
        value={value?.id || ""}
        onChange={handleChange}
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
