/**
 * Open a project where its work is. A project with no saved tabs opens onto
 * the start page, so its card looked dead: the tab title changed and nothing
 * else did. Open its most recently edited document instead. With no documents
 * yet there is nothing to open, so bring the start page's document list,
 * where they will appear, into view.
 */

import { useCallback } from "react";

import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";
import { useOpenProject } from "./useProjects";
import { PROJECT_DOCUMENTS_ID } from "../components/projects/projectDocumentsAnchor";
import type {
  ProjectDetail,
  ProjectDocument
} from "../components/projects/projectStatus";

export const useResumeProject = (): ((detail: ProjectDetail) => void) => {
  const openProject = useOpenProject();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  return useCallback(
    ({ project, documents }: ProjectDetail) => {
      void openProject(project).then((opened) => {
        if (!opened || useWorkspaceTabsStore.getState().activeTabId !== null) {
          return;
        }
        const latest = documents.reduce<ProjectDocument | undefined>(
          (newest, doc) =>
            !newest || doc.updatedAt > newest.updatedAt ? doc : newest,
          undefined
        );
        if (latest) {
          openTab({
            type: latest.type,
            ref: latest.ref,
            title: latest.name,
            projectId: project.id
          });
          return;
        }
        requestAnimationFrame(() => {
          document
            .getElementById(PROJECT_DOCUMENTS_ID)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    },
    [openProject, openTab]
  );
};
