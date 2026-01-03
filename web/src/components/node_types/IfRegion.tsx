/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { Node, NodeProps } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import RegionNode from "./RegionNode";
import isEqual from "lodash/isEqual";

/**
 * IfRegion - A visual container region with true/false branches.
 *
 * Similar to VVVV Gamma's If region, nodes placed inside this container
 * will execute conditionally based on the input condition.
 *
 * Visual features:
 * - Dashed border with secondary color accent
 * - Branch icon (CallSplit) in header
 * - True/False branch indicators showing which path is active
 * - Drag nodes in/out to include them in conditional execution
 *
 * Branch assignment:
 * - Nodes placed in the left half of the region are in the TRUE branch
 * - Nodes placed in the right half of the region are in the FALSE branch
 * - Branch assignment is determined by the node's x-position relative to the region center
 *
 * @example
 * The backend determines which branch to execute:
 * - If condition is true: only TRUE branch nodes execute
 * - If condition is false: only FALSE branch nodes execute
 * - Result is the output from whichever branch executed
 */
const IfRegion: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  return <RegionNode {...props} regionType="if" />;
};

export default memo(IfRegion, isEqual);
