import { useCallback } from "react";
import useOnboardingStore from "../stores/OnboardingStore";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";
import type { ExampleAppSummary } from "../utils/exampleApps";

/** Opens a shipped example app in its own tab, where it runs without a copy. */
export const useOpenExampleApp = (): ((
  app: Pick<ExampleAppSummary, "slug" | "name">
) => void) => {
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  return useCallback(
    (app) => {
      openTab({
        type: "example-app",
        ref: app.slug,
        mode: "view",
        title: app.name
      });
      useOnboardingStore.getState().markStep("keep-creating");
    },
    [openTab]
  );
};
