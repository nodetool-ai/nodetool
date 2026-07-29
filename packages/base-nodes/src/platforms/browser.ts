/**
 * Browser-portable node bundle (compatibility re-export).
 *
 * Re-exports the curated universal subset from the focused node
 * packages. Browser bundlers should prefer importing directly from
 * `@nodetool-ai/core-nodes`, `@nodetool-ai/text-nodes`, etc. — this
 * subpath stays for the existing `@nodetool-ai/base-nodes/platforms/browser`
 * import surface used by the workflow-runner e2e harness.
 */

import type { NodeClass } from "@nodetool-ai/node-sdk";

import {
  COMPARE_NODES,
  CONSTANT_NODES,
  CONTROL_NODES,
  EXTENDED_PLACEHOLDER_NODES,
  FAKE_MEDIA_NODES,
  INPUT_NODES,
  LIB_DATETIME_NODES,
  LIB_VALIDATE_NODES,
  LIST_NODES,
  SUBGRAPH_NODES,
  VECTOR_NODES,
  WORKFLOW_NODES
} from "@nodetool-ai/core-nodes";

import {
  LIB_BEAUTIFULSOUP_NODES,
  LIB_MARKDOWN_NODES,
  LIB_NLP_NODES
} from "@nodetool-ai/text-nodes";

import { CODE_NODES, CodeNode } from "@nodetool-ai/code-nodes";

export {
  CODE_NODES,
  COMPARE_NODES,
  CONSTANT_NODES,
  CONTROL_NODES,
  EXTENDED_PLACEHOLDER_NODES,
  FAKE_MEDIA_NODES,
  INPUT_NODES,
  LIB_DATETIME_NODES,
  LIB_BEAUTIFULSOUP_NODES,
  LIB_MARKDOWN_NODES,
  LIB_NLP_NODES,
  LIB_VALIDATE_NODES,
  LIST_NODES,
  SUBGRAPH_NODES,
  VECTOR_NODES,
  WORKFLOW_NODES,
  CodeNode
};

/**
 * All browser-portable node classes in one flat array. Callers can
 * register them en masse without enumerating the named exports above.
 */
export const ALL_BROWSER_NODES: readonly NodeClass[] = [
  ...CODE_NODES,
  ...COMPARE_NODES,
  ...CONSTANT_NODES,
  ...CONTROL_NODES,
  ...EXTENDED_PLACEHOLDER_NODES,
  ...FAKE_MEDIA_NODES,
  ...INPUT_NODES,
  ...LIB_DATETIME_NODES,
  ...LIB_BEAUTIFULSOUP_NODES,
  ...LIB_MARKDOWN_NODES,
  ...LIB_NLP_NODES,
  ...LIB_VALIDATE_NODES,
  ...LIST_NODES,
  ...SUBGRAPH_NODES,
  ...VECTOR_NODES,
  ...WORKFLOW_NODES,
  CodeNode
];
