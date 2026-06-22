import isEqual from "fast-deep-equal";
import { NodeData } from "../../stores/NodeData";

/**
 * A node's `data` carries the entire node blob — every property value, dynamic
 * inputs/outputs, exposed-input placements, etc. A single property field only
 * reads its own value (passed separately as `value`), `data.workflow_id`, and —
 * for dynamic fields — the identity of `data.dynamic_properties` (the
 * delete/rename handlers in PropertyInput close over the live map and must not
 * operate on a stale set).
 *
 * Comparing the whole `data` with a deep equal (the previous `memo(..., isEqual)`)
 * meant that editing one property re-rendered AND deep-walked every other field
 * on the node, since `data` differs for all of them. This compares only the
 * slices a field actually depends on.
 */
export const isFieldRelevantDataEqual = (
  prev: NodeData,
  next: NodeData,
  isDynamicProperty: boolean | undefined
): boolean => {
  if (prev === next) {
    return true;
  }
  if (prev.workflow_id !== next.workflow_id) {
    return false;
  }
  if (isDynamicProperty && prev.dynamic_properties !== next.dynamic_properties) {
    return false;
  }
  return true;
};

export { isEqual };
