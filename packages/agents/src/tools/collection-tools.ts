/**
 * Collection discovery + query tools.
 *
 * These let the chat agent find and read knowledge collections on its own,
 * replacing the old client-side collection picker. Both are read-only.
 *
 * Both are thin subclasses now: the implementations live in the `collections`
 * capability module (`../capabilities/collections.ts`).
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import {
  listCollections,
  queryCollection
} from "../capabilities/collections.js";

/** A run over one call's context. These two need nothing else. */
function collectionRun(context: ProcessingContext) {
  return createCapabilityRun({ context, gate: UNGATED });
}

/**
 * @deprecated Ported to the `collections` capability module
 * (`../capabilities/collections.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ListCollectionsTool extends CapabilityTool {
  constructor() {
    super(listCollections.spec, listCollections.impl, collectionRun);
  }
}

/**
 * @deprecated Ported to the `collections` capability module
 * (`../capabilities/collections.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class QueryCollectionTool extends CapabilityTool {
  constructor() {
    super(queryCollection.spec, queryCollection.impl, collectionRun);
  }
}
