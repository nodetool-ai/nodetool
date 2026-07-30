/**
 * Fault layer barrel (task D1). Importing this module registers every
 * built-in fault module as a side effect — the same "import to register"
 * shape `@nodetool-ai/base-nodes`' `registerBaseNodes` and this harness's own
 * `registerFixtureNodes` use — so `compare.ts`/`cli.ts` only need to import
 * `faults/index.js` once to have every known fault name resolvable.
 *
 * D2 (WS proxy) and D3 (bridge/host) add a sibling module file exporting
 * their own `FaultModule[]` plus a `register*FaultModules()` function, call
 * it from this barrel, and are done — `types.ts`/`registry.ts`/`compare.ts`
 * need no changes.
 */
export * from "./types.js";
export * from "./registry.js";
export * from "./provider-faults.js";
export * from "./net-proxy.js";
export * from "./ws-proxy.js";
export * from "./ws-faults.js";
export * from "./bridge-faults.js";
export * from "./host-faults.js";

import { registerProviderFaultModules } from "./provider-faults.js";
import { registerWsFaultModules } from "./ws-faults.js";
import { registerBridgeFaultModules } from "./bridge-faults.js";
import { registerHostFaultModules } from "./host-faults.js";

registerProviderFaultModules();
registerWsFaultModules();
registerBridgeFaultModules();
registerHostFaultModules();
