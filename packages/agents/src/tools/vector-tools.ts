/**
 * Vector database search tools.
 *
 * Port of src/nodetool/agents/tools/chroma_tools.py
 *
 * All six are thin subclasses now: the implementations live in the
 * `collections` capability module (`../capabilities/collections.ts`), and the
 * `VectorCollection` each one took as a constructor argument is stored on the
 * run the wrapper builds.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { VectorCollection } from "@nodetool-ai/vectorstore";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import {
  vectorBatchIndex,
  vectorHybridSearch,
  vectorIndex,
  vectorMarkdownSplitAndIndex,
  vectorRecursiveSplitAndIndex,
  vectorTextSearch
} from "../capabilities/collections.js";
import type { CapabilityExport } from "../capabilities/index.js";

export { splitTextRecursive } from "./vector-tool-support.js";

/**
 * Re-exported here under the legacy name so external code that imports
 * `VecCollection` from `@nodetool-ai/agents` keeps compiling.
 */
export type VecCollection = VectorCollection;

/**
 * The shape every one of these classes shares: a constructor that takes the
 * collection and a run that carries it, so a capability resolves per call what
 * used to be closed over at construction.
 */
abstract class VectorCapabilityTool extends CapabilityTool {
  constructor(entry: CapabilityExport, collection: VectorCollection) {
    super(entry.spec, entry.impl, (context: ProcessingContext) =>
      createCapabilityRun({
        context,
        gate: UNGATED,
        vectorCollection: collection
      })
    );
  }
}

/**
 * @deprecated Ported to the `collections` capability module
 * (`../capabilities/collections.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class VecTextSearchTool extends VectorCapabilityTool {
  constructor(collection: VectorCollection) {
    super(vectorTextSearch, collection);
  }
}

/**
 * @deprecated Ported to the `collections` capability module
 * (`../capabilities/collections.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class VecIndexTool extends VectorCapabilityTool {
  constructor(collection: VectorCollection) {
    super(vectorIndex, collection);
  }
}

/**
 * @deprecated Ported to the `collections` capability module
 * (`../capabilities/collections.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class VecHybridSearchTool extends VectorCapabilityTool {
  constructor(collection: VectorCollection) {
    super(vectorHybridSearch, collection);
  }
}

/**
 * @deprecated Ported to the `collections` capability module
 * (`../capabilities/collections.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class VecRecursiveSplitAndIndexTool extends VectorCapabilityTool {
  constructor(collection: VectorCollection) {
    super(vectorRecursiveSplitAndIndex, collection);
  }
}

/**
 * @deprecated Ported to the `collections` capability module
 * (`../capabilities/collections.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class VecMarkdownSplitAndIndexTool extends VectorCapabilityTool {
  constructor(collection: VectorCollection) {
    super(vectorMarkdownSplitAndIndex, collection);
  }
}

/**
 * @deprecated Ported to the `collections` capability module
 * (`../capabilities/collections.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class VecBatchIndexTool extends VectorCapabilityTool {
  constructor(collection: VectorCollection) {
    super(vectorBatchIndex, collection);
  }
}
