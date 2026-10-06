import React, { memo, useCallback } from "react";

import useMetadataStore from "../../stores/MetadataStore";
import { ToolbarIconButton } from "../ui_primitives";
import { useAddConnectedNode } from "../../hooks/nodes/useAddConnectedNode";
import {
  outputQuickActionsFor,
  type OutputQuickAction
} from "../../config/outputQuickActions";

interface OutputQuickActionButtonsProps {
  nodeId: string;
  outputName: string;
  outputType: string;
}

const QuickActionButton: React.FC<{
  action: OutputQuickAction;
  onRun: (action: OutputQuickAction) => void;
}> = ({ action, onRun }) => {
  const handleClick = useCallback(() => onRun(action), [action, onRun]);
  return (
    <ToolbarIconButton
      title={action.label}
      size="small"
      onClick={handleClick}
      className={`overlay-icon-btn output-quick-action-${action.key}`}
      aria-label={action.label}
    >
      <action.Icon />
    </ToolbarIconButton>
  );
};

/**
 * Hover-toolbar buttons that create a follow-up node (Upscale, Remove
 * background, Edit) and wire this node's output into it.
 */
const OutputQuickActionButtons: React.FC<OutputQuickActionButtonsProps> = ({
  nodeId,
  outputName,
  outputType
}) => {
  const metadata = useMetadataStore((state) => state.metadata);
  const addConnectedNode = useAddConnectedNode();
  const handleRun = useCallback(
    (action: OutputQuickAction) => {
      addConnectedNode({
        nodeType: action.nodeType,
        sourceId: nodeId,
        sourceHandle: outputName,
        sourceType: outputType,
        targetHandle: action.targetHandle
      });
    },
    [addConnectedNode, nodeId, outputName, outputType]
  );

  const actions = outputQuickActionsFor(outputType).filter(
    (action) => metadata[action.nodeType] !== undefined
  );
  if (actions.length === 0) {
    return null;
  }
  return (
    <>
      {actions.map((action) => (
        <QuickActionButton key={action.key} action={action} onRun={handleRun} />
      ))}
    </>
  );
};

export default memo(OutputQuickActionButtons);
