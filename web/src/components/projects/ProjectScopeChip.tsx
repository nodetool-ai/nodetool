import { useCallback, useRef, useState } from "react";

import { ContextMenu, MenuItemPrimitive } from "../ui_primitives";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useOpenProject, useProjects } from "../../hooks/useProjects";
import { PROJECT_GLYPH } from "./projectIdentity";

interface ProjectScopeChipProps {
  projectId: string;
  /** The group's own tabs supply the name until the project list arrives. */
  fallbackName: string;
}

/**
 * The tab bar's project scope: the name the grouped tabs belong to, and the
 * menu that switches project, opens the overview, or closes the group.
 */
const ProjectScopeChip = ({ projectId, fallbackName }: ProjectScopeChipProps) => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { data: projects } = useProjects();
  const openProject = useOpenProject();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const closeProject = useWorkspaceTabsStore((state) => state.closeProject);

  const project = projects?.find((entry) => entry.id === projectId);
  const name = project?.name ?? fallbackName;
  const close = useCallback(() => setOpen(false), []);

  const handleOpenOverview = useCallback(() => {
    close();
    openTab({
      type: "project",
      ref: projectId,
      mode: "view",
      title: name,
      projectId
    });
  }, [close, name, openTab, projectId]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="project-scope"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Project ${name}`}
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
        compact
      >
        <MenuItemPrimitive
          label="Open overview"
          compact
          onClick={handleOpenOverview}
        />
        <MenuItemPrimitive
          label="Close group"
          compact
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
              secondary="Switch to"
              compact
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
