import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ContextMenu, MenuItemPrimitive } from "../ui_primitives";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useOpenNewProjectTab, useOpenProject, useProjects } from "../../hooks/useProjects";
import { PROJECT_GLYPH } from "./projectIdentity";

interface ProjectScopeChipProps {
  projectId: string;
  /** The group's own tabs supply the name until the project list arrives. */
  fallbackName: string;
}

/**
 * The tab bar's project scope: the name the grouped tabs belong to, and the
 * menu that switches project, opens editor home, or closes the group.
 */
const ProjectScopeChip = ({ projectId, fallbackName }: ProjectScopeChipProps) => {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { data: projects } = useProjects();
  const openProject = useOpenProject();
  const openHome = useOpenNewProjectTab();
  const closeProject = useWorkspaceTabsStore((state) => state.closeProject);

  const project = projects?.find((entry) => entry.id === projectId);
  const name = project?.name ?? fallbackName;
  const close = useCallback(() => setOpen(false), []);

  const handleOpenHome = useCallback(() => {
    close();
    openHome();
  }, [close, openHome]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="project-scope"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("pass3_34.projects.scope.projectLabel", { name })}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="glyph" aria-hidden>
          {PROJECT_GLYPH}
        </span>
        <span className="project-scope-name">{name}</span>
        <span className="project-scope-caret" aria-hidden>
          ▾
        </span>
      </button>
      <ContextMenu
        open={open}
        anchorEl={anchorRef.current}
        onClose={close}
      >
        <MenuItemPrimitive
          label={t("pass3_34.projects.scope.openEditorHome")}
          onClick={handleOpenHome}
        />
        <MenuItemPrimitive
          label={t("pass3_34.projects.scope.closeGroup")}
          dividerAfter={(projects?.length ?? 0) > 1}
          onClick={() => {
            close();
            closeProject(projectId);
          }}
        />
        {projects
          ?.filter((entry) => entry.id !== projectId)
          .map((entry) => (
            <MenuItemPrimitive
              key={entry.id}
              label={entry.name}
              secondary={t("pass3_34.projects.scope.switchTo")}
              onClick={() => {
                close();
                void openProject(entry);
              }}
            />
          ))}
      </ContextMenu>
    </>
  );
};

export default ProjectScopeChip;
