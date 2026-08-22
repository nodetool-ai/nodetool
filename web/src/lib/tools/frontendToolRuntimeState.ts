import type { FrontendToolState } from "./frontendTools";

let runtimeState: FrontendToolState | null = null;

export function setFrontendToolRuntimeState(state: FrontendToolState): void {
  runtimeState = state;
}

export function getFrontendToolRuntimeState(): FrontendToolState {
  if (!runtimeState) {
    throw new Error(
      "Frontend tool runtime state is not initialized: no mounted editor " +
        "panel has registered the workflow runtime yet, so ui_* tools have " +
        "nothing to run against. Open or reload the NodeTool workspace window " +
        "(the editor panel mounts it), then retry."
    );
  }
  return runtimeState;
}
