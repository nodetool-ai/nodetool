import type { LiveDeviceFactory } from "./liveDevice";

// Placeholder until the BL1 port lands.
export const createBl1Device: LiveDeviceFactory = () =>
  Promise.reject(new Error("BL1 live device is not implemented"));
