import { memo } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import NodeToolButtons from "./NodeToolButtons";
import { useNodes } from "../../contexts/NodeContext";
import useSelect from "../../hooks/nodes/useSelect";
import { useDelayedVisibility } from "../../hooks/useDelayedVisibility";

const TOOLBAR_SHOW_DELAY = 200;

interface NodeSelectionToolbarProps {
  id: string;
  selected: boolean;
  dragging?: boolean;
}

/** Delayed so that click-to-drag does not flash the toolbar. */
const NodeSelectionToolbar = memo(function NodeSelectionToolbar({
  id,
  selected,
  dragging
}: NodeSelectionToolbarProps) {
  const activeSelect = useSelect((state) => state.activeSelect);
  const selectedCount = useNodes((state) => state.getSelectedNodeCount());
  const delayedSelected = useDelayedVisibility({
    shouldBeVisible: selected && !dragging,
    delay: TOOLBAR_SHOW_DELAY
  });
  const isVisible =
    delayedSelected && !activeSelect && !dragging && selectedCount === 1;
  return (
    <NodeToolbar position={Position.Top} offset={0} isVisible={isVisible}>
      <NodeToolButtons nodeId={id} />
    </NodeToolbar>
  );
});

export default NodeSelectionToolbar;
