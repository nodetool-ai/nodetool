/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  Caption,
  ContextMenu,
  EditorButton,
  FlexRow,
  MenuItemPrimitive,
  SearchInput,
  SPACING,
  Text,
  getSpacingPx
} from "../ui_primitives";
import {
  LOOSE_PROJECT_ID,
  PROJECT_LIST_REF,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import {
  useOpenNewProjectTab,
  useOpenProject,
  useProjects
} from "../../hooks/useProjects";
import { PROJECT_COLOR, PROJECT_GLYPH } from "./projectIdentity";
import { ActivityIndicator } from "../timeline/ActivityIndicator";

const selectorStyles = (theme: Theme) => css({
  minHeight: "40px",
  flexShrink: 0,
  padding: `0 ${getSpacingPx(SPACING.xl)}`,
  backgroundColor: theme.vars.palette.c_app_header,
  borderBottom: `1px solid ${theme.vars.palette.divider}`,
  WebkitAppRegion: "drag",
  "& .selector-button": {
    WebkitAppRegion: "no-drag",
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.md),
    minHeight: "32px",
    maxWidth: "min(100%, 360px)",
    padding: `0 ${getSpacingPx(SPACING.md)}`,
    border: "1px solid transparent",
    borderRadius: BORDER_RADIUS.md,
    background: "transparent",
    color: theme.vars.palette.text.primary,
    cursor: "pointer",
    "&:hover, &:focus-visible": {
      backgroundColor: theme.vars.palette.action.hover,
      borderColor: theme.vars.palette.divider
    }
  },
  "& .selector-name": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  "& .selector-glyph": { color: PROJECT_COLOR },
  [theme.breakpoints.down("sm")]: {
    padding: `0 ${getSpacingPx(SPACING.md)}`,
    "& > .MuiTypography-root": { display: "none" },
    "& .selector-button": { flex: 1, minWidth: 0 }
  }
});

const ProjectSelector = () => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: projects, isPending, error } = useProjects();
  const openProject = useOpenProject();
  const openNewProject = useOpenNewProjectTab();
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const setActiveProjectId = useWorkspaceTabsStore(
    (state) => state.setActiveProjectId
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const activeProject = projects?.find(
    (project) => project.id === activeProjectId
  );
  const activeTabTitle = useWorkspaceTabsStore((state) => {
    const tab = state.tabs.find((entry) => entry.id === state.activeTabId);
    return tab?.projectId === activeProjectId ? tab.title : undefined;
  });
  const name =
    activeProject?.name ??
    (activeProjectId ? activeTabTitle ?? "Project" : "Personal");
  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  const selectPersonal = useCallback(() => {
    close();
    setActiveProjectId(null);
  }, [close, setActiveProjectId]);

  const selectProject = useCallback(
    (project: { id: string; name: string }) => {
      close();
      void openProject(project);
    },
    [close, openProject]
  );

  const openProjects = useCallback(() => {
    close();
    openTab({
      type: "project-list",
      ref: PROJECT_LIST_REF,
      mode: "view",
      title: "Projects"
    });
  }, [close, openTab]);

  const needle = search.trim().toLowerCase();
  const visibleProjects = (projects ?? []).filter((project) =>
    project.name.toLowerCase().includes(needle)
  );

  return (
    <FlexRow css={selectorStyles(theme)} align="center" gap={SPACING.md}>
      <button
        ref={anchorRef}
        type="button"
        className="selector-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Selected project: ${name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="selector-glyph" aria-hidden>{PROJECT_GLYPH}</span>
        <Text className="selector-name">{name}</Text>
        <span aria-hidden>▾</span>
      </button>
      <Caption color="muted">Project</Caption>
      <ActivityIndicator />
      <ContextMenu
        open={open}
        anchorEl={anchorRef.current}
        onClose={close}
        paperSx={{ minWidth: "280px", p: SPACING.sm }}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Find a project"
          ariaLabel="Find a project"
          fullWidth
          sx={{ mb: SPACING.sm }}
        />
        <MenuItemPrimitive
          label="Personal"
          secondary="Unassigned work"
          selected={
            activeProjectId === null || activeProjectId === LOOSE_PROJECT_ID
          }
          onClick={selectPersonal}
        />
        {isPending && (
          <Caption sx={{ px: SPACING.md, py: SPACING.sm }}>
            Loading projects…
          </Caption>
        )}
        {error && (
          <Caption color="error" sx={{ px: SPACING.md, py: SPACING.sm }}>
            Could not load projects
          </Caption>
        )}
        {visibleProjects.map((project) => (
          <MenuItemPrimitive
            key={project.id}
            label={project.name}
            selected={project.id === activeProjectId}
            onClick={() => selectProject(project)}
          />
        ))}
        {!isPending && !error && visibleProjects.length === 0 && (
          <Caption sx={{ px: SPACING.md, py: SPACING.sm }}>
            {needle ? "No matching projects" : "No named projects yet"}
          </Caption>
        )}
        <FlexRow
          className="selector-actions"
          gap={SPACING.sm}
          sx={{ px: SPACING.md, pt: SPACING.sm, pb: SPACING.md }}
        >
          <EditorButton
            density="compact"
            variant="outlined"
            onClick={openNewProject}
          >
            New project
          </EditorButton>
          <EditorButton
            density="compact"
            variant="outlined"
            onClick={openProjects}
          >
            Manage projects
          </EditorButton>
        </FlexRow>
      </ContextMenu>
    </FlexRow>
  );
};

export default ProjectSelector;
