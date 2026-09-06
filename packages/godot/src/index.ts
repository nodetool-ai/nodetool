export { checkGodotProject } from "./check.js";
export { extResourceId, resourceUid, subResourceId } from "./ids.js";
export { readTres, readTscn, referencedIds } from "./reader.js";
export type {
  FrameRegion,
  GodotBlock,
  GodotCopy,
  GodotFile,
  GodotProject,
  GodotProjectInput,
  ReferencedIds,
  TscnDocument
} from "./types.js";
export { frameRegion, slotFileStem, writeGodotProject } from "./writer.js";
