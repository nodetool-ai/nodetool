import type { NodeClass } from "@nodetool-ai/node-sdk";

import { MuapiImageToVideoNode } from "./nodes/image-to-video.js";
import { MuapiTextToVideoNode } from "./nodes/text-to-video.js";

export { MuapiImageToVideoNode } from "./nodes/image-to-video.js";
export { MuapiTextToVideoNode } from "./nodes/text-to-video.js";
export {
  MUAPI_IMAGE_TO_VIDEO_ENDPOINT,
  MUAPI_TEXT_TO_VIDEO_ENDPOINT,
  normalizeMuapiVideoDuration,
  videoRefFromBytes
} from "./muapi-base.js";

export const MUAPI_NODES: readonly NodeClass[] = [
  MuapiTextToVideoNode,
  MuapiImageToVideoNode
];

export function registerMuapiNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of MUAPI_NODES) {
    registry.register(nodeClass);
  }
}
