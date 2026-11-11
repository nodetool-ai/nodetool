// The queue lives in @nodetool-ai/runtime-install, so the installers there
// and the desktop's own npm and backend work share one queue per key.
export { runExclusive } from "@nodetool-ai/runtime-install";
