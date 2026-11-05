import { writeFileSync } from "node:fs";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import "../../src/timeline-preview/render-child.js";

// Observe the cached device used by the production child. Do not replace its
// message handler, compositor, precision options or response pixels.
process.on("message", async () => {
  const device = await getNodeGPUDevice();
  const path = process.env.A432_CHILD_ADAPTER;
  if (!path) throw new Error("Missing adapter report path");
  writeFileSync(path, JSON.stringify({ vendor: device.adapterInfo.vendor,
    device: device.adapterInfo.device, description: device.adapterInfo.description }));
});
