/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";

import ErrorBanner from "../support/ErrorBanner";
import {
  BORDER_RADIUS,
  Caption,
  CONTROL,
  ContextMenu,
  FlexRow,
  MenuItemPrimitive,
  MOTION,
  SearchInput,
  SPACING,
  TruncatedText,
  getSpacingPx,
  LoadingSpinner
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
    flexShrink: 0,
    height: inline ? "auto" : "100%",
    maxWidth: inline ? "100%" : "220px",
    "& .selector-button": {
      display: "grid",
      gridTemplateColumns: "auto minmax(0, 1fr) auto",
      alignItems: "center",
      columnGap: getSpacingPx(SPACING.md),
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
              gridTemplateColumns: "auto",
              justifyItems: "center",
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
  const { t } = useTranslation();
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
      ? t("pass3_34.projects.selector.personal")
      : activeProjectId
        ? (activeTabTitle ?? t("pass3_34.projects.selector.project"))
        : t("pass3_34.projects.selector.personal"));
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
      void openProject({
        id: resolvedPersonalId,
        name: t("pass3_34.projects.selector.personal")
      }).then(
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
    setActiveProjectId,
    t
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
    <FlexRow
      align="stretch"
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
          inline || mobile
            ? t("pass3_34.projects.selector.selectedProject", { name })
            : t("pass3_34.projects.selector.selectProject")
        }
        onClick={() => setOpen((value) => !value)}
      >
        <span className="selector-glyph" aria-hidden>
          {PROJECT_GLYPH}
        </span>
        <TruncatedText
          component="span"
          className="selector-name"
          sx={{ flex: 1 }}
        >
          {inline || mobile ? name : t("pass3_34.projects.selector.project")}
        </TruncatedText>
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
            label={t("pass3_34.projects.selector.projectHome")}
            icon={<HomeRoundedIcon />}
            onClick={openProjectHome}
            dividerAfter
          />
        )}
        {!inline && (
          <MenuItemPrimitive
            label={t("pass3_34.projects.selector.newProject")}
            icon={<AddOutlinedIcon />}
            onClick={openNewProject}
            color="primary"
            dividerAfter
          />
        )}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("pass3_34.projects.selector.searchProjects")}
          ariaLabel={t("pass3_34.projects.selector.searchProjects")}
          fullWidth
          sx={{ my: SPACING.xs, px: SPACING.xs, boxSizing: "border-box" }}
        />
        <MenuItemPrimitive
          label={t("pass3_34.projects.selector.personal")}
          className="project-menu-item"
          selected={
            activeProjectId === resolvedPersonalId ||
            activeProjectId === null ||
            activeProjectId === LOOSE_PROJECT_ID
          }
          onClick={selectPersonal}
        />
        {isPending && (
          <LoadingSpinner
            size="small"
            text={t("pass3_34.projects.selector.loadingProjects")}
          />
        )}
        {error && (
          <ErrorBanner
            sx={{ mx: SPACING.sm, my: SPACING.xs }}
            report={{
              source: "operation-failure",
              summary: t("pass3_34.projects.selector.projectListLoadFailed"),
              errorText: error.message
            }}
          >
            {t("pass3_34.projects.selector.couldNotLoadProjects")}
          </ErrorBanner>
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
            {needle
              ? t("pass3_34.projects.selector.noMatchingProjects")
              : t("pass3_34.projects.selector.noNamedProjects")}
          </Caption>
        )}
      </ContextMenu>
      <NewProjectDialog open={newProjectOpen} onClose={closeNewProject} />
    </FlexRow>
  );
};

export default ProjectSelector;
