/**
 * What survives of the six `vector_*` tools after the port to the
 * `collections` capability module (`../capabilities/collections.ts`): the text
 * splitter and the collection type alias other code imports.
 *
 * The `VectorCollection` each tool took as a constructor argument now rides on
 * the run (`CapabilityRun.vectorCollection`), so a host that has a collection
 * builds the tools with `toolForCapabilityName(name, run)`.
 */

import type { VectorCollection } from "@nodetool-ai/vectorstore";

export { splitTextRecursive } from "./vector-tool-support.js";

/**
 * Re-exported here under the legacy name so external code that imports
 * `VecCollection` from `@nodetool-ai/agents` keeps compiling.
 */
export type VecCollection = VectorCollection;
