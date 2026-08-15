import { memo, useCallback, useMemo } from "react";
import type { SelectChangeEvent } from "../ui_primitives";
import { WorkflowList } from "../../stores/ApiTypes";
import PropertyLabel from "../node/PropertyLabel";
import { useQuery } from "@tanstack/react-query";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "../../utils/isEqual";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { workflowListQueryKey } from "../../serverState/workflowQueryKeys";
import { NodeSelect, NodeMenuItem } from "../editor_ui";
import type { WorkflowValue } from "./WorkflowProperty";

import {
  OutlinedInput
} from "../ui_primitives";
const WorkflowListProperty = (props: PropertyProps<WorkflowValue[] | null>) => {
  const id = `workflow-list-${props.property.name}-${props.propertyIndex}`;
  const workflowIds: string[] = props.value?.map((workflow) => workflow.id) || [];
  const load = useWorkflowManager((state) => state.load);

  const { data, error, isLoading } = useQuery<WorkflowList, Error>({
    queryKey: workflowListQueryKey(200),
    queryFn: async () => {
      return await load("", 200);
    }
  });

  const workflowMap = useMemo(() => {
    return new Map((data?.workflows || []).map(w => [w.id, w.name]));
  }, [data?.workflows]);

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
      return ids.map((id: string) => workflowMap.get(id) || "").filter(Boolean).join(", ");
    },
    [workflowMap]
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
        {isLoading && <NodeMenuItem disabled>Loading…</NodeMenuItem>}
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
