import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

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
  label: string;
  onRun: (action: OutputQuickAction) => void;
}> = ({ action, label, onRun }) => {
  const handleClick = useCallback(() => onRun(action), [action, onRun]);
  return (
    <ToolbarIconButton
      title={label}
      size="small"
      onClick={handleClick}
      className={`overlay-icon-btn output-quick-action-${action.key}`}
      aria-label={label}
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
  const { t } = useTranslation();
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
        <QuickActionButton
          key={action.key}
          action={action}
          label={t(`i18n-next36.nodeEditor.outputQuickActions.${action.key}`)}
          onRun={handleRun}
        />
      ))}
    </>
  );
};

export default memo(OutputQuickActionButtons);
