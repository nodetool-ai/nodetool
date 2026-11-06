import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { HeadlessFrameCompositor } from "@nodetool-ai/timeline/frame-compositor";
import type { RenderChildRequest } from "./render-child-client.js";

// Dawn retains native handles. The parent owns termination and awaits close.
process.once("disconnect", () => process.kill(process.pid, "SIGKILL"));
if (!process.connected) process.kill(process.pid, "SIGKILL");
let compositor: HeadlessFrameCompositor | undefined;
let busy = false;
const idle = (): ReturnType<typeof setTimeout> => setTimeout(() => process.kill(process.pid, "SIGKILL"), 60_000);
let watchdog = idle();
process.on("message", async (message: unknown) => {
  if (busy) return;
  busy = true;
  clearTimeout(watchdog);
  watchdog = idle();
  try {
    if (!message || typeof message !== "object") throw new Error("Invalid timeline render payload");
    const request = message as RenderChildRequest;
    if (!compositor) {
      compositor = new HeadlessFrameCompositor(await getNodeGPUDevice(), request.width, request.height);
      compositor.setReferenceSize(request.referenceWidth, request.referenceHeight);
    }
    const pixels = await compositor.renderFrame(request.layers, request.groups, {}, request.adjustments);
    process.send?.({ pixels, skippedLayerIds: [...compositor.skippedLayerIds], effectsNotApplied: [...compositor.effectsNotApplied] });
  } catch (error) {
    process.send?.({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    busy = false;
  }
});
