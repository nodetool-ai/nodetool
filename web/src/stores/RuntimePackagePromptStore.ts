import { create } from "zustand";
import type { NodeErrorDetail } from "@nodetool-ai/protocol";

interface RuntimePackagePromptState {
  /** The runtime package to install, or null when the dialog is shut. */
  packageId: string | null;
  show: (packageId: string) => void;
  dismiss: () => void;
}

/**
 * Drives the dialog that installs a missing optional package in place. A run
 * that fails because, say, whisper.cpp is not installed offers the install
 * directly instead of naming the Package Manager in a toast.
 */
const useRuntimePackagePromptStore = create<RuntimePackagePromptState>(
  (set) => ({
    packageId: null,
    show: (packageId) => set({ packageId }),
    dismiss: () => set({ packageId: null })
  })
);

/** Runs that already offered an install: one dialog per run is enough. */
const promptedRuns = new Set<string>();

/** Offer to install the package a node failure is missing. */
export const promptForMissingPackage = (
  detail: NodeErrorDetail,
  runKey: string
): void => {
  if (
    detail.code !== "missing_runtime_package" ||
    !detail.runtime_package ||
    promptedRuns.has(runKey)
  ) {
    return;
  }
  promptedRuns.add(runKey);
  useRuntimePackagePromptStore.getState().show(detail.runtime_package);
};

/**
 * Offer to install a package a REST response named. Outside a run there is
 * nothing to deduplicate against: each refused request is one user action.
 */
export const promptForMissingRuntimePackage = (packageId: unknown): void => {
  if (typeof packageId === "string" && packageId !== "") {
    useRuntimePackagePromptStore.getState().show(packageId);
  }
};

/** Forget that a run prompted, so a rerun under the same id can prompt again. */
export const resetMissingPackagePrompt = (runKey: string): void => {
  promptedRuns.delete(runKey);
};

export default useRuntimePackagePromptStore;
