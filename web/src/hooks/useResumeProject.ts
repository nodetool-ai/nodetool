/**
 * Open a project where its work is. A project with no saved tabs opens onto
 * the start page, so its card looked dead: the tab title changed and nothing
 * else did. Open its most recently edited document instead. With no documents
 * yet there is nothing to open, so bring the start page's document list,
 * where they will appear, into view.
 */

import { useCallback, useEffect, useRef } from "react";

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
  const lifetimeRef = useRef<{ active: boolean; frames: Set<number> } | null>(
    null
  );
  useEffect(() => {
    const lifetime = { active: true, frames: new Set<number>() };
    lifetimeRef.current = lifetime;
    return () => {
      lifetime.active = false;
      for (const frame of lifetime.frames) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);
  return useCallback(
    ({ project, documents }: ProjectDetail) => {
      const lifetime = lifetimeRef.current;
      if (!lifetime?.active) {
        return;
      }
      void openProject(project).then((opened) => {
        if (
          !lifetime.active ||
          !opened ||
          useWorkspaceTabsStore.getState().activeTabId !== null
        ) {
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
        const frame = requestAnimationFrame(() => {
          lifetime.frames.delete(frame);
          if (!lifetime.active) {
            return;
          }
          document
            .getElementById(PROJECT_DOCUMENTS_ID)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        lifetime.frames.add(frame);
      });
    },
    [openProject, openTab]
  );
};
