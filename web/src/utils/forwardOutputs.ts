/**
 * "Forward" nodes pass a value straight through from an input to an output
 * without changing its type (the backend models this as `outputCorrelation`
 * kind "forward"). The editor doesn't receive correlation metadata, so the
 * mapping is declared here: for each forward node type, which input handle a
 * given output handle is forwarded from.
 *
 * Used to chase an edge's true upstream source through forward nodes so the
 * edge adopts the real type (color), not the declared `any`.
 */
import { REROUTE_NODE_TYPE } from "../constants/nodeTypes";

const FORWARD_OUTPUT_SOURCE: Record<string, Record<string, string>> = {
  [REROUTE_NODE_TYPE]: { output: "input_value" },
  "nodetool.control.If": { if_true: "value", if_false: "value" },
  "nodetool.control.Switch": { matched: "input", default: "input" }
};

/**
 * The input handle that `outputHandle` is forwarded from on a forward node, or
 * undefined when the node/handle isn't a passthrough.
 */
export const forwardInputHandle = (
  nodeType: string | undefined,
  outputHandle: string
): string | undefined =>
  nodeType ? FORWARD_OUTPUT_SOURCE[nodeType]?.[outputHandle] : undefined;

/**
 * Whether `inputHandle` is a passthrough input on a forward node (its value is
 * forwarded to one or more outputs). Used so an incoming edge adopts the
 * source's type/color.
 */
export const isForwardInput = (
  nodeType: string | undefined,
  inputHandle: string
): boolean =>
  nodeType
    ? Object.values(FORWARD_OUTPUT_SOURCE[nodeType] ?? {}).includes(inputHandle)
    : false;
