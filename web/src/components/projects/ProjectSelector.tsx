/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";

import {
  BORDER_RADIUS,
  Caption,
  CONTROL,
  ContextMenu,
  MenuItemPrimitive,
  MOTION,
  SearchInput,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import {
  useOpenNewProjectTab,
  useOpenProject,
  useProjects
} from "../../hooks/useProjects";
import { useAuth } from "../../stores/useAuth";
import NewProjectDialog from "./NewProjectDialog";
import { PROJECT_COLOR, PROJECT_GLYPH } from "./projectIdentity";

const selectorStyles = (theme: Theme, inline: boolean, mobile: boolean) =>
  css({
    WebkitAppRegion: "no-drag",
    display: "flex",
    alignItems: "stretch",
    flexShrink: 0,
    height: inline ? "auto" : "100%",
    maxWidth: inline ? "100%" : "220px",
    "& .selector-button": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      minWidth: 0,
      maxWidth: "100%",
      height: inline ? "auto" : "100%",
      padding: inline
        ? `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`
        : `0 ${getSpacingPx(SPACING.lg)}`,
      border: inline ? `1px solid ${theme.vars.palette.divider}` : "none",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: inline ? BORDER_RADIUS.md : 0,
      background: "transparent",
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      whiteSpace: "nowrap",
      transition: `color ${MOTION.fast}, background-color ${MOTION.fast}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.c_overlay_subtle
      }
    },
    "& .selector-glyph": {
      color: PROJECT_COLOR,
      flexShrink: 0
    },
    "& .selector-name": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: 0
    },
    "& .selector-caret": {
      fontSize: "var(--fontSizeSmall)",
      opacity: 0.75,
      flexShrink: 0,
      lineHeight: 1
    },
    // The mobile header row names the project in full, so it is not
    // collapsed to the glyph like the desktop selector on a narrow window.
    [theme.breakpoints.down("sm")]:
      inline || mobile
        ? {}
        : {
            "& .selector-name, & .selector-caret": { display: "none" },
            "& .selector-button": {
              justifyContent: "center",
              minWidth: CONTROL.height.xl,
              padding: `0 ${getSpacingPx(SPACING.md)}`
            }
          }
  });

interface ProjectSelectorProps {
  inline?: boolean;
  /**
   * Mobile header variant: the button shows the project name, and the menu
   * leads with the project home, which has no button of its own on a phone.
   */
  mobile?: boolean;
}

const ProjectSelector = ({
  inline = false,
  mobile = false
}: ProjectSelectorProps) => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: projects, isPending, error } = useProjects();
  const openProject = useOpenProject();
  const openNewProjectTab = useOpenNewProjectTab();
  const authUserId = useAuth((state) => state.user?.id);
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const personalProjectId = useWorkspaceTabsStore(
    (state) => state.personalProjectId
  );
  const setActiveProjectId = useWorkspaceTabsStore(
    (state) => state.setActiveProjectId
  );
  const resolvePersonalProject = useWorkspaceTabsStore(
    (state) => state.resolvePersonalProject
  );

  const activeProject = projects?.find(
    (project) => project.id === activeProjectId
  );
  const activeTabTitle = useWorkspaceTabsStore((state) => {
    const tab = state.tabs.find((entry) => entry.id === state.activeTabId);
    return tab?.projectId === activeProjectId ? tab.title : undefined;
  });
  const name =
    activeProject?.name ??
    (activeProjectId === personalProjectId
      ? "Personal"
      : activeProjectId
        ? (activeTabTitle ?? "Project")
        : "Personal");
  const personalProject = projects?.find((project) => project.isPersonal);
  const resolvedPersonalId =
    personalProject?.id ??
    personalProjectId ??
    (authUserId ? `personal:${authUserId}` : null);
  useEffect(() => {
    if (resolvedPersonalId) resolvePersonalProject(resolvedPersonalId);
  }, [resolvePersonalProject, resolvedPersonalId]);
  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  const selectPersonal = useCallback(() => {
    close();
    if (resolvedPersonalId) {
      void openProject({ id: resolvedPersonalId, name: "Personal" }).then(
        (opened) => {
          if (opened && inline) openNewProjectTab();
        }
      );
    } else {
      setActiveProjectId(null);
    }
  }, [
    close,
    inline,
    openNewProjectTab,
    openProject,
    resolvedPersonalId,
    setActiveProjectId
  ]);

  const selectProject = useCallback(
    (project: { id: string; name: string }) => {
      close();
      void openProject(project).then((opened) => {
        if (opened && inline) openNewProjectTab();
      });
    },
    [close, inline, openNewProjectTab, openProject]
  );

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const openNewProject = useCallback(() => {
    close();
    setNewProjectOpen(true);
  }, [close]);
  const closeNewProject = useCallback(() => setNewProjectOpen(false), []);

  const openProjectHome = useCallback(() => {
    close();
    openNewProjectTab();
  }, [close, openNewProjectTab]);

  const needle = search.trim().toLowerCase();
  const visibleProjects = (projects ?? []).filter(
    (project) =>
      !project.isPersonal && project.name.toLowerCase().includes(needle)
  );

  return (
    <div
      css={selectorStyles(theme, inline, mobile)}
      className="project-selector"
    >
      <button
        ref={anchorRef}
        type="button"
        className="selector-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          inline || mobile ? `Selected project: ${name}` : "Select project"
        }
        onClick={() => setOpen((value) => !value)}
      >
        <span className="selector-glyph" aria-hidden>
          {PROJECT_GLYPH}
        </span>
        <span className="selector-name">
          {inline || mobile ? name : "Project"}
        </span>
        <span className="selector-caret" aria-hidden>
          ▾
        </span>
      </button>
      <ContextMenu
        open={open}
        anchorEl={anchorRef.current}
        onClose={close}
        paperSx={{
          width: getSpacingPx(80),
          maxWidth: `calc(100vw - ${getSpacingPx(SPACING.xxxl)})`,
          "& .project-menu-item .MuiListItemText-primary": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }
        }}
      >
        {mobile && (
          <MenuItemPrimitive
            label="Project home"
            icon={<HomeRoundedIcon />}
            onClick={openProjectHome}
            dividerAfter
          />
        )}
        {!inline && (
          <MenuItemPrimitive
            label="New project"
            icon={<AddRoundedIcon />}
            onClick={openNewProject}
            color="primary"
            dividerAfter
          />
        )}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search projects"
          ariaLabel="Search projects"
          fullWidth
          sx={{ my: SPACING.xs, px: SPACING.xs, boxSizing: "border-box" }}
        />
        <MenuItemPrimitive
          label="Personal"
          className="project-menu-item"
          selected={
            activeProjectId === resolvedPersonalId ||
            activeProjectId === null ||
            activeProjectId === LOOSE_PROJECT_ID
          }
          onClick={selectPersonal}
        />
        {isPending && (
          <Caption sx={{ px: SPACING.lg, py: SPACING.sm }}>
            Loading projects…
          </Caption>
        )}
        {error && (
          <Caption color="error" sx={{ px: SPACING.lg, py: SPACING.sm }}>
            Could not load projects
          </Caption>
        )}
        {visibleProjects.map((project) => (
          <MenuItemPrimitive
            key={project.id}
            label={project.name}
            className="project-menu-item"
            selected={project.id === activeProjectId}
            onClick={() => selectProject(project)}
          />
        ))}
        {!isPending && !error && visibleProjects.length === 0 && (
          <Caption sx={{ px: SPACING.lg, py: SPACING.sm }}>
            {needle ? "No matching projects" : "No named projects yet"}
          </Caption>
        )}
      </ContextMenu>
      <NewProjectDialog open={newProjectOpen} onClose={closeNewProject} />
    </div>
  );
};

export default ProjectSelector;
