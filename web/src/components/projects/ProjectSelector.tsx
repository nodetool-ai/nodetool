/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  Caption,
  CONTROL,
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
import { useAuth } from "../../stores/useAuth";
import { PROJECT_COLOR, PROJECT_GLYPH } from "./projectIdentity";
import { ActivityIndicator } from "../timeline/ActivityIndicator";

const selectorStyles = (theme: Theme) =>
  css({
    minHeight: CONTROL.height.xl,
    flexShrink: 0,
    padding: `0 ${getSpacingPx(SPACING.xl)}`,
    backgroundColor: theme.vars.palette.c_app_header,
    WebkitAppRegion: "drag",
    justifyContent: "flex-end",
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
      void openProject({ id: resolvedPersonalId, name: "Personal" });
    } else {
      setActiveProjectId(null);
    }
  }, [close, openProject, resolvedPersonalId, setActiveProjectId]);

  const selectProject = useCallback(
    (project: { id: string; name: string }) => {
      close();
      void openProject(project);
    },
    [close, openProject]
  );

  const openProjects = useCallback(() => {
    close();
    setActiveProjectId(null);
    openTab({
      type: "project-list",
      ref: PROJECT_LIST_REF,
      mode: "view",
      title: "Projects"
    });
  }, [close, openTab, setActiveProjectId]);

  const openNewProject = useCallback(() => {
    close();
    setActiveProjectId(null);
    openNewProjectTab();
  }, [close, openNewProjectTab, setActiveProjectId]);

  const needle = search.trim().toLowerCase();
  const visibleProjects = (projects ?? []).filter(
    (project) =>
      !project.isPersonal && project.name.toLowerCase().includes(needle)
  );

  return (
    <FlexRow css={selectorStyles(theme)} align="center" gap={SPACING.md}>
      <EditorButton
        ref={anchorRef}
        size="medium"
        variant="text"
        className="selector-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Selected project: ${name}`}
        onClick={() => setOpen((value) => !value)}
        sx={{
          WebkitAppRegion: "no-drag",
          minWidth: 0,
          maxWidth: "100%",
          gap: SPACING.md,
          color: theme.vars.palette.text.primary
        }}
      >
        <span className="selector-glyph" aria-hidden>
          {PROJECT_GLYPH}
        </span>
        <Text className="selector-name">{name}</Text>
        <span aria-hidden>▾</span>
      </EditorButton>
      <Caption color="muted">Project</Caption>
      <ActivityIndicator />
      <ContextMenu
        open={open}
        anchorEl={anchorRef.current}
        onClose={close}
        paperSx={{ p: SPACING.sm }}
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
          secondary="Your personal workspace"
          selected={
            activeProjectId === resolvedPersonalId ||
            activeProjectId === null ||
            activeProjectId === LOOSE_PROJECT_ID
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
