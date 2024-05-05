import { useCallback } from "react";
import { NodeRef } from "../../stores/ApiTypes";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import NodeSelect from "../node_menu/NodeSelect";

export function NodeListProperty(props: PropertyProps) {
  const id = `node-list-${props.property.name}-${props.propertyIndex}`;
  const value = props.value?.map((node: NodeRef) => node.id) || [];
  const onChange = useCallback(
    (nodeTypes: string[]) => {
      props.onChange(nodeTypes.map((type) => ({ type: "node", id: type })));
    },
    [props]
  );

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id} />
      <NodeSelect
        value={value}
        onChange={onChange}
      />
    </>
  );
}
