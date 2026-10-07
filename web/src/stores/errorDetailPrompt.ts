import type { NodeErrorDetail } from "@nodetool-ai/protocol";

import {
  promptForProviderAuth,
  resetProviderAuthPrompt
} from "./providerAuthPrompt";
import {
  promptForMissingPackage,
  resetMissingPackagePrompt
} from "./RuntimePackagePromptStore";

/**
 * Open the screen that fixes a node failure with a structured cause: provider
 * onboarding for a refused credential, the install dialog for a missing
 * package. Each prompt ignores the codes it does not handle.
 */
export const promptForErrorDetail = (
  detail: NodeErrorDetail,
  runKey: string
): void => {
  promptForProviderAuth(detail, runKey);
  promptForMissingPackage(detail, runKey);
};

/** Forget that a run prompted, so a rerun under the same id can prompt again. */
export const resetErrorDetailPrompts = (runKey: string): void => {
  resetProviderAuthPrompt(runKey);
  resetMissingPackagePrompt(runKey);
};
