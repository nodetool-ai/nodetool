/**
 * Registers the FableSynth machines as live devices. Each machine module is
 * imported on first use: it pulls in its worklet URL and engine code, which
 * neither the editor's first paint nor Jest should load.
 */

import { registerLiveDevice } from "./liveDevice";

registerLiveDevice("wavetable", async (ctx, instrument, options) =>
  (await import("./wt1Device")).createWt1Device(ctx, instrument, options)
);
registerLiveDevice("bass", async (ctx, instrument, options) =>
  (await import("./bl1Device")).createBl1Device(ctx, instrument, options)
);
registerLiveDevice("drum", async (ctx, instrument, options) =>
  (await import("./dr1Device")).createDr1Device(ctx, instrument, options)
);
