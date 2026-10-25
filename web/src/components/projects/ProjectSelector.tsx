/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";

import ErrorBanner from "../support/ErrorBanner";
import {
  BORDER_RADIUS,
  Box,
  Caption,
  CONTROL,
  ContextMenu,
  FieldDensityContext,
  FlexRow,
  focusRing,
  InlineEditableText,
  ListSubheader,
  MENU_ICON_SIZE,
  MenuItemPrimitive,
  MenuList,
  menuListStyles,
  MOTION,
  Popover,
  SearchInput,
  SPACING,
  TruncatedText,
  getSpacingPx,
  LoadingSpinner
} from "../ui_primitives";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import {
  useOpenNewProjectTab,
  useOpenProject,
  useProjects
} from "../../hooks/useProjects";
import { useAuth } from "../../stores/useAuth";
import { trpc, trpcClient } from "../../trpc/client";
import { menuMaxHeight } from "../workspace/OpenMenu";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import { relativeTime } from "../../utils/formatDateAndTime";
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
    // App bar control: the name opens the project home, the caret opens the
    // project menu. The home is a page of its own, so the name part draws the
    // active-tab state while it is open.
    "& .selector-home": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      minWidth: 0,
      height: "100%",
      padding: `0 ${getSpacingPx(SPACING.xs)} 0 ${getSpacingPx(SPACING.lg)}`,
      border: "none",
      background: "transparent",
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      whiteSpace: "nowrap",
      transition: `color ${MOTION.fast}, background-color ${MOTION.fast}`,
      "&:hover": { backgroundColor: theme.vars.palette.c_overlay_subtle },
      "&:focus-visible": focusRing(theme),
      // Same size as the tab titles beside it.
      "& .selector-name": { fontSize: "inherit", fontWeight: "inherit" }
    },
    "& .selector-rename": {
      display: "flex",
      alignItems: "center",
      minWidth: 0,
      padding: `0 ${getSpacingPx(SPACING.xs)} 0 ${getSpacingPx(SPACING.lg)}`,
      "& .selector-rename-input": {
        minWidth: 0,
        width: "100%",
        padding: 0,
        border: "none",
        background: "transparent",
        color: "inherit",
        fontSize: "var(--fontSizeSmall)",
        fontWeight: 500,
        outline: "none",
        borderRadius: BORDER_RADIUS.sm,
        "&:focus-visible": focusRing(theme, 2)
      }
    },
    "& .selector-menu-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      width: CONTROL.height.xs,
      height: "100%",
      padding: 0,
      border: "none",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1,
      transition: `color ${MOTION.fast}, background-color ${MOTION.fast}`,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.c_overlay_subtle
      },
      "&:focus-visible": focusRing(theme)
    },
    "&.home-active": {
      backgroundColor: "var(--c_editor_bg_color)",
      boxShadow: `inset 0 -2px 0 ${theme.vars.palette.primary.main}`
    },
    // The mobile header row names the project in full, so it is not
    // collapsed to the glyph like the desktop selector on a narrow window.
    [theme.breakpoints.down("sm")]:
      inline || mobile
        ? {}
        : {
            "& .selector-name, & .selector-caret": { display: "none" },
            "& .selector-button, & .selector-home": {
              gridTemplateColumns: "auto",
              justifyItems: "center",
              minWidth: CONTROL.height.xl,
              padding: `0 ${getSpacingPx(SPACING.md)}`
            }
          }
  });

/** A type glyph in a menu row's icon slot, centred so the labels align. */
const MenuGlyph = ({ glyph, color }: { glyph: string; color: string }) => (
  <Box
    component="span"
    aria-hidden
    sx={{ width: MENU_ICON_SIZE, textAlign: "center", lineHeight: 1, color }}
  >
    {glyph}
  </Box>
);

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
  const documentsProjectId =
    activeProjectId && activeProjectId !== LOOSE_PROJECT_ID
      ? activeProjectId
      : resolvedPersonalId;
  // The home page beside the inline picker already lists the documents.
  const showDocuments = !inline && Boolean(documentsProjectId);
  const documentsQuery = trpc.projects.documents.useQuery(
    { id: documentsProjectId ?? "" },
    { enabled: open && showDocuments, staleTime: 15_000 }
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  const split = !inline && !mobile;
  const homeIsActive = useWorkspaceTabsStore((state) => {
    const tab = state.tabs.find((entry) => entry.id === state.activeTabId);
    return !tab || tab.type === "project-new";
  });
  const canRename = Boolean(activeProject && !activeProject.isPersonal);
  const trpcUtils = trpc.useUtils();
  const [renaming, setRenaming] = useState(false);
  const [renameMenuPosition, setRenameMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [nameOverride, setNameOverride] = useState<{
    projectId: string;
    name: string;
  } | null>(null);
  const displayedName =
    nameOverride?.projectId === activeProjectId ? nameOverride.name : name;

  const commitRename = useCallback(
    async (newName: string) => {
      setRenaming(false);
      if (!activeProjectId || !activeProject || newName === activeProject.name) {
        return;
      }
      setNameOverride({ projectId: activeProjectId, name: newName });
      try {
        const updated = await trpcClient.projects.update.mutate({
          id: activeProjectId,
          name: newName
        });
        trpcUtils.projects.list.setData({}, (current) =>
          current?.map((project) =>
            project.id === activeProjectId ? updated : project
          )
        );
        void trpcUtils.projects.list.invalidate();
        void trpcUtils.projects.summaries.invalidate();
      } catch {
        // The list query still holds the previous name on a failed save.
      } finally {
        setNameOverride(null);
      }
    },
    [
      activeProject,
      activeProjectId,
      trpcUtils.projects.list,
      trpcUtils.projects.summaries
    ]
  );

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

  const openDocument = useCallback(
    (document: { type: WorkspaceTabType; ref: string; name: string }) => {
      close();
      if (!documentsProjectId) return;
      openTab({
        type: document.type,
        ref: document.ref,
        title: document.name,
        projectId: documentsProjectId
      });
    },
    [close, documentsProjectId, openTab]
  );

  const needle = search.trim().toLowerCase();
  const matchingDocuments = (documentsQuery.data ?? [])
    .filter((document) => document.name.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const visibleProjects = (projects ?? []).filter(
    (project) =>
      !project.isPersonal && project.name.toLowerCase().includes(needle)
  );
  const searchLabel = showDocuments
    ? t("pass3_34.projects.selector.searchProjectsAndDocuments")
    : t("pass3_34.projects.selector.searchProjects");

  const projectsListRef = useRef<HTMLUListElement>(null);
  const documentsListRef = useRef<HTMLUListElement>(null);
  const firstItem = (list: HTMLUListElement | null) =>
    list?.querySelector<HTMLElement>('[role="menuitem"]') ?? null;

  // The search field sits outside both lists, so the menu's type-ahead
  // cannot take its keystrokes. Arrow down steps into the project list.
  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "ArrowDown") return;
      const target =
        firstItem(projectsListRef.current) ??
        firstItem(documentsListRef.current);
      if (!target) return;
      event.preventDefault();
      target.focus();
    },
    []
  );

  // Left and right arrows move between the two columns.
  const handleColumnKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      const target =
        event.key === "ArrowRight"
          ? firstItem(documentsListRef.current)
          : event.key === "ArrowLeft"
            ? firstItem(projectsListRef.current)
            : null;
      if (!target || event.currentTarget.contains(target)) return;
      event.preventDefault();
      target.focus();
    },
    []
  );

  // Bring the current project into view when the menu opens.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      projectsListRef.current
        ?.querySelector(".Mui-selected")
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // A new query starts both columns at their first match.
  useEffect(() => {
    projectsListRef.current?.scrollTo({ top: 0 });
    documentsListRef.current?.scrollTo({ top: 0 });
  }, [needle]);

  return (
    <FlexRow
      align="stretch"
      css={selectorStyles(theme, inline, mobile)}
      className={`project-selector${split && homeIsActive ? " home-active" : ""}`}
    >
      {split ? (
        <>
          {renaming ? (
            <div className="selector-rename">
              <InlineEditableText
                className="selector-rename-input"
                ariaLabel={t("i18n-next51.tabBar.projectName")}
                value={displayedName}
                editing
                onEditingChange={setRenaming}
                onCommit={(next) => void commitRename(next)}
                onCancel={() => setRenaming(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              className="selector-home"
              aria-label={t("pass3_34.projects.selector.openProjectHome", {
                name: displayedName
              })}
              aria-current={homeIsActive ? "page" : undefined}
              onClick={openNewProjectTab}
              onDoubleClick={() => {
                if (canRename) setRenaming(true);
              }}
              onContextMenu={(event) => {
                if (!canRename) return;
                event.preventDefault();
                setRenameMenuPosition({ x: event.clientX, y: event.clientY });
              }}
            >
              <span className="selector-glyph" aria-hidden>
                {PROJECT_GLYPH}
              </span>
              <TruncatedText component="span" className="selector-name">
                {displayedName}
              </TruncatedText>
            </button>
          )}
          <button
            ref={anchorRef}
            type="button"
            className="selector-menu-button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t("pass3_34.projects.selector.selectProject")}
            onClick={() => setOpen((value) => !value)}
          >
            <span aria-hidden>▾</span>
          </button>
          <ContextMenu
            open={renameMenuPosition !== null}
            position={renameMenuPosition}
            onClose={() => setRenameMenuPosition(null)}
          >
            <MenuItemPrimitive
              label={t("i18n-next51.tabBar.rename")}
              onClick={() => {
                setRenameMenuPosition(null);
                setRenaming(true);
              }}
            />
          </ContextMenu>
        </>
      ) : (
        <button
          ref={anchorRef}
          type="button"
          className="selector-button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("pass3_34.projects.selector.selectedProject", {
            name
          })}
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
            {name}
          </TruncatedText>
          <span className="selector-caret" aria-hidden>
            ▾
          </span>
        </button>
      )}
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={close}
        paperSx={{
          width: showDocuments
            ? { xs: getSpacingPx(80), sm: getSpacingPx(160) }
            : getSpacingPx(80),
          maxWidth: `calc(100vw - ${getSpacingPx(SPACING.xxxl)})`,
          maxHeight: open ? menuMaxHeight(anchorRef.current) : undefined,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          "& .project-menu-item .MuiListItemText-primary": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }
        }}
      >
        <Box
          sx={{
            p: SPACING.sm,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <FieldDensityContext.Provider value="compact">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={searchLabel}
              ariaLabel={searchLabel}
              autoFocus
              fullWidth
              onKeyDown={handleSearchKeyDown}
            />
          </FieldDensityContext.Provider>
        </Box>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              sm: showDocuments
                ? "minmax(0, 1fr) minmax(0, 1fr)"
                : "minmax(0, 1fr)"
            },
            flex: 1,
            minHeight: 0,
            // A phone stacks the columns and scrolls them as one list; wider
            // windows scroll each column on its own.
            overflowY: { xs: "auto", sm: "hidden" }
          }}
        >
          <MenuList
            ref={projectsListRef}
            aria-label={t("pass3_34.projects.selector.projects")}
            onKeyDown={handleColumnKeyDown}
            sx={{
              ...menuListStyles(theme),
              minHeight: 0,
              overflowY: { xs: "visible", sm: "auto" },
              borderRight: showDocuments
                ? { sm: `1px solid ${theme.vars.palette.divider}` }
                : undefined
            }}
          >
            {showDocuments && (
              <ListSubheader>{t("pass3_34.projects.selector.projects")}</ListSubheader>
            )}
            {mobile && (
              <MenuItemPrimitive
                label={t("pass3_34.projects.selector.projectHome")}
                icon={<HomeRoundedIcon />}
                onClick={openProjectHome}
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
            <MenuItemPrimitive
              label={t("pass3_34.projects.selector.personal")}
              className="project-menu-item"
              icon={<MenuGlyph glyph={PROJECT_GLYPH} color={PROJECT_COLOR} />}
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
                icon={<MenuGlyph glyph={PROJECT_GLYPH} color={PROJECT_COLOR} />}
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
          </MenuList>
          {showDocuments && (
            <MenuList
              ref={documentsListRef}
              aria-label={t("pass3_34.projects.selector.documents")}
              onKeyDown={handleColumnKeyDown}
              sx={{
                ...menuListStyles(theme),
                minHeight: 0,
                overflowY: { xs: "visible", sm: "auto" }
              }}
            >
              <ListSubheader>{t("pass3_34.projects.selector.documents")}</ListSubheader>
              {documentsQuery.isPending && (
                <LoadingSpinner
                  size="small"
                  text={t("pass3_34.projects.selector.loadingDocuments")}
                />
              )}
              {documentsQuery.error && (
                <ErrorBanner
                  sx={{ mx: SPACING.sm, my: SPACING.xs }}
                  report={{
                    source: "operation-failure",
                    summary: t("pass3_34.projects.selector.couldNotLoadDocuments"),
                    errorText: documentsQuery.error.message
                  }}
                >
                  {t("pass3_34.projects.selector.couldNotLoadDocuments")}
                </ErrorBanner>
              )}
              {matchingDocuments.map((document) => (
                <MenuItemPrimitive
                  key={`${document.type}:${document.ref}`}
                  label={document.name}
                  className="project-menu-item"
                  icon={
                    <MenuGlyph
                      glyph={TYPE_GLYPH[document.type]}
                      color={TYPE_COLOR[document.type]}
                    />
                  }
                  shortcut={relativeTime(document.updatedAt)}
                  onClick={() => openDocument(document)}
                />
              ))}
              {documentsQuery.data && matchingDocuments.length === 0 && (
                <Caption sx={{ px: SPACING.lg, py: SPACING.sm }}>
                  {needle
                    ? t("pass3_34.projects.selector.noMatchingDocuments")
                    : t("pass3_34.projects.selector.noDocuments")}
                </Caption>
              )}
            </MenuList>
          )}
        </Box>
      </Popover>
      <NewProjectDialog open={newProjectOpen} onClose={closeNewProject} />
    </FlexRow>
  );
};

export default ProjectSelector;
