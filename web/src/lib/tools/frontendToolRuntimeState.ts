import type { FrontendToolState } from "./frontendTools";

let runtimeState: FrontendToolState | null = null;

export function setFrontendToolRuntimeState(state: FrontendToolState): void {
  runtimeState = state;
}

export function getFrontendToolRuntimeState(): FrontendToolState {
  if (!runtimeState) {
    throw new Error("Frontend tool runtime state is not initialized");
  }
  return runtimeState;
}
