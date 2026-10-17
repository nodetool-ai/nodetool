import type { LiveDeviceFactory } from "./liveDevice";

// Placeholder until the WT1 port lands.
export const createWt1Device: LiveDeviceFactory = () =>
  Promise.reject(new Error("WT1 live device is not implemented"));
