/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import RegionNode from "./RegionNode";
import isEqual from "lodash/isEqual";

/**
 * ForEachRegion - A visual container region that executes contained nodes
 * for each item in a list.
 *
 * Similar to VVVV Gamma's ForEach region, nodes placed inside this container
 * will execute once per iteration when the workflow runs.
 *
 * Visual features:
 * - Dashed border with primary color accent
 * - Loop icon in header
 * - Iteration count badge showing progress (e.g., "3/10")
 * - Drag nodes in/out to include them in the iteration
 *
 * @example
 * The backend provides iteration context:
 * - current_item: The current element from the input list
 * - current_index: The current iteration index (0-based)
 * - total_count: Total number of items to iterate over
 */
const ForEachRegion: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  return <RegionNode {...props} regionType="foreach" />;
};

export default memo(ForEachRegion, isEqual);
