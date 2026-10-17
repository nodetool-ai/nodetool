import type { LiveDeviceFactory } from "./liveDevice";

// Placeholder until the DR1 port lands.
export const createDr1Device: LiveDeviceFactory = () =>
  Promise.reject(new Error("DR1 live device is not implemented"));
