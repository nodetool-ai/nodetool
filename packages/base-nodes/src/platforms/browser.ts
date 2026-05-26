/**
 * Browser-portable node bundle.
 *
 * Re-exports only the `_NODES` arrays from modules whose import graph
 * contains no static `node:fs` / `node:path` / native dependency — i.e.
 * the UNIVERSAL bucket from the classifier. Importing this entry point
 * yields a tree that bundlers can safely package for the browser.
 *
 * Hybrid modules (`lib-image-*` with WebGPU code paths) are *not*
 * included here because they statically import `sharp` for the Node
 * execution path — that import crashes module init in a browser.
 */

import type { NodeClass } from "@nodetool-ai/node-sdk";

import { CODE_NODES } from "../nodes/code.js";
import { COMPARE_NODES } from "../nodes/compare.js";
import { CONSTANT_NODES } from "../nodes/constant.js";
import { CONTROL_NODES } from "../nodes/control.js";
import { EXTENDED_PLACEHOLDER_NODES } from "../nodes/extended-placeholders.js";
import { INPUT_NODES } from "../nodes/input.js";
import { LIB_DATETIME_NODES } from "../nodes/lib-datetime.js";
import { LIB_BEAUTIFULSOUP_NODES } from "../nodes/lib-html-parse.js";
import { LIB_MARKDOWN_NODES } from "../nodes/lib-markdown.js";
import { LIB_NLP_NODES } from "../nodes/lib-nlp.js";
import { LIB_VALIDATE_NODES } from "../nodes/lib-validate.js";
import { LIST_NODES } from "../nodes/list.js";
import { SUBGRAPH_NODES } from "../nodes/subgraph.js";
import { TEAM_NODES } from "../nodes/team.js";
import { VECTOR_NODES } from "../nodes/vector.js";
import { WORKFLOW_NODES } from "../nodes/workflow.js";
import { CodeNode } from "../nodes/code-node.js";

export {
  CODE_NODES,
  COMPARE_NODES,
  CONSTANT_NODES,
  CONTROL_NODES,
  EXTENDED_PLACEHOLDER_NODES,
  INPUT_NODES,
  LIB_DATETIME_NODES,
  LIB_BEAUTIFULSOUP_NODES,
  LIB_MARKDOWN_NODES,
  LIB_NLP_NODES,
  LIB_VALIDATE_NODES,
  LIST_NODES,
  SUBGRAPH_NODES,
  TEAM_NODES,
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
  ...INPUT_NODES,
  ...LIB_DATETIME_NODES,
  ...LIB_BEAUTIFULSOUP_NODES,
  ...LIB_MARKDOWN_NODES,
  ...LIB_NLP_NODES,
  ...LIB_VALIDATE_NODES,
  ...LIST_NODES,
  ...SUBGRAPH_NODES,
  ...TEAM_NODES,
  ...VECTOR_NODES,
  ...WORKFLOW_NODES,
  CodeNode
];
