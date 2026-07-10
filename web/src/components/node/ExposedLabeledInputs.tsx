/** @jsxImportSource @emotion/react */
/**
 * Labeled input rows for user-promoted `exposedInputsLabeled` properties.
 * Renders handle + label + property editors at the bottom of the node body
 * (same widgets as inline fields, promoted via exposedInputsLabeled).
 */

import React, { memo, useMemo } from "react";
import isEqual from "../../utils/isEqual";

import NodeInputs from "./NodeInputs";
import { Property, NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import { resolveExposedInputLabeledNames } from "../../utils/exposedInputs";

export interface ExposedLabeledInputsProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  properties: Property[];
  className?: string;
}

const ExposedLabeledInputsImpl: React.FC<ExposedLabeledInputsProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  properties,
  className
}) => {
  const labeledNames = useMemo(
    () => new Set(resolveExposedInputLabeledNames(data)),
    [data]
  );

  const labeledProperties = useMemo(
    () => properties.filter((p) => labeledNames.has(p.name)),
    [labeledNames, properties]
  );

  if (labeledProperties.length === 0) {
    return null;
  }

  return (
    <div className={["exposed-labeled-inputs", className].filter(Boolean).join(" ")}>
      <NodeInputs
        id={id}
        nodeMetadata={nodeMetadata}
        layout={nodeMetadata.layout}
        properties={labeledProperties}
        nodeType={nodeType}
        data={data}
        showFields={true}
        showHandle={true}
        editableDynamicInputs={false}
      />
    </div>
  );
};

export const ExposedLabeledInputs = memo(ExposedLabeledInputsImpl, isEqual);
ExposedLabeledInputs.displayName = "ExposedLabeledInputs";

export default ExposedLabeledInputs;
