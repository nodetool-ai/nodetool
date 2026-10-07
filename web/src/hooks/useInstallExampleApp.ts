import {
  useMutation,
  useQueryClient,
  type UseMutationResult
} from "@tanstack/react-query";
import { useNotificationStore } from "../stores/NotificationStore";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";
import {
  installExampleApp,
  type ExampleAppSummary,
  type InstalledExampleApp
} from "../utils/exampleApps";

type InstallTarget = Pick<ExampleAppSummary, "slug" | "name">;

interface InstalledCopy {
  projectId: string;
  created: InstalledExampleApp;
}

/**
 * Installs a copy of a shipped example app into the creation project and
 * opens the copy in its own tab.
 */
export const useInstallExampleApp = (): UseMutationResult<
  InstalledCopy,
  unknown,
  InstallTarget
> => {
  const queryClient = useQueryClient();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  return useMutation<InstalledCopy, unknown, InstallTarget>({
    mutationFn: async (app) => {
      const projectId = creationProjectId();
      return {
        projectId,
        created: await installExampleApp(app.slug, projectId)
      };
    },
    onSuccess: async ({ projectId, created }) => {
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      openTab({
        type: "application",
        ref: created.id,
        mode: "view",
        title: created.name,
        projectId
      });
      addNotification({
        type: "success",
        alert: true,
        content: `Added "${created.name}" to your apps`
      });
    },
    onError: (error, app) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Couldn't add ${app.name}: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  });
};
