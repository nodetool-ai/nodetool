import { createBundledPackSource } from "@nodetool-ai/base-nodes/server-pack-source";
import type { PackSource } from "@nodetool-ai/websocket/pack-source";

export const bundledPackSource: PackSource = createBundledPackSource();
