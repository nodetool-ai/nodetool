import type { NodeClass } from "@nodetool-ai/node-sdk";

import { MuapiImageToVideoNode } from "./nodes/image-to-video.js";
import { MuapiTextToImageNode } from "./nodes/text-to-image.js";
import { MuapiTextToVideoNode } from "./nodes/text-to-video.js";

export { MuapiImageToVideoNode } from "./nodes/image-to-video.js";
export { MuapiTextToImageNode } from "./nodes/text-to-image.js";
export { MuapiTextToVideoNode } from "./nodes/text-to-video.js";
export {
  MUAPI_BASE_URL,
  MUAPI_IMAGE_ASPECT_RATIOS,
  MUAPI_IMAGE_MODELS,
  MUAPI_IMAGE_RESOLUTIONS,
  MUAPI_VIDEO_ASPECT_RATIOS,
  MUAPI_VIDEO_RESOLUTIONS,
  downloadMuapiOutput,
  generateMuapiMedia,
  getMuapiApiKey,
  normalizeMuapiVideoDuration,
  pickMuapiOutputUrl,
  pollMuapi,
  submitMuapi,
  uploadMuapiImage,
  videoRefFromBytes
} from "./muapi-base.js";
export type {
  GenerateMuapiMediaOptions,
  MuapiPollOptions
} from "./muapi-base.js";

export const MUAPI_NODES: readonly NodeClass[] = [
  MuapiTextToImageNode,
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
