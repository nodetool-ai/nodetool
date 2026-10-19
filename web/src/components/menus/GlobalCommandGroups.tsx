/**
 * Command menu groups that work on every view: switching tabs and projects,
 * opening app pages, creating documents, importing app bundles, opening
 * workflows, and help.
 *
 * The menu host at the app root renders these outside the router tree, so
 * navigation goes through `navigateTo`, never `useNavigate`.
 */
import React, { memo, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Command } from "cmdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BugReportIcon from "@mui/icons-material/BugReport";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import FolderZipRoundedIcon from "@mui/icons-material/FolderZipRounded";
import KeyboardRoundedIcon from "@mui/icons-material/KeyboardRounded";
import MovieFilterOutlinedIcon from "@mui/icons-material/MovieFilterOutlined";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";

import {
  runCommandAndClose,
  useCommandMenuStore
} from "../../stores/CommandMenuStore";
import {
  PROJECT_LIST_REF,
  creationProjectId,
  isTabInScope,
  useWorkspaceTabsStore,
  type WorkspaceTab
} from "../../stores/WorkspaceTabsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import { openBugReport } from "../../stores/BugReportStore";
import { useOpenProject, useProjects } from "../../hooks/useProjects";
import { workflowListQueryKey } from "../../serverState/workflowQueryKeys";
import { useAppMenuActions } from "../panels/useAppMenuActions";
import {
  TEXT_FILE_TEMPLATES,
  useNewDocumentCatalog
} from "../workspace/newDocumentCatalog";
import { TYPE_GLYPH, tabDisplayTitle } from "../workspace/tabTypeIdentity";
import { PROJECT_GLYPH } from "../projects/projectIdentity";
import { navigateTo } from "../../lib/appNavigation";
import {
  exportApplicationBundle,
  exportApplicationProject,
  importApplicationBundle
} from "../../utils/applicationBundle";
import type { Workflow, WorkflowList } from "../../stores/ApiTypes";

const WORKSPACE_PATH = "/workspace";

/** Tabs live in the workspace; leave any other route so the tab shows. */
export const showWorkspace = (): void => {
  if (window.location.pathname !== WORKSPACE_PATH) {
    navigateTo(WORKSPACE_PATH);
  }
};

const glyphStyle: React.CSSProperties = {
  width: "18px",
  textAlign: "center",
  flexShrink: 0
};

const Glyph = ({ children }: { children: React.ReactNode }) => (
  <span aria-hidden="true" style={glyphStyle}>
    {children}
  </span>
);

/**
 * cmdk keys items by `value`, so two tabs with one title would highlight
 * together. Number the repeats to keep each value unique.
 */
const uniqueValues = (labels: readonly string[]): string[] => {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return count === 1 ? label : `${label} (${count})`;
  });
};

/** The open tabs of the current project, so any tab is a few keys away. */
export const SwitchTabCommands = memo(function SwitchTabCommands() {
  const { t } = useTranslation();
  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const setActiveTab = useWorkspaceTabsStore((state) => state.setActiveTab);
  const onWorkspace = window.location.pathname === WORKSPACE_PATH;

  // On another route the active tab is not on screen, so it is a destination
  // too. In the workspace it is where the user already is.
  const targets = useMemo(
    () =>
      tabs.filter(
        (tab) =>
          tab.type !== "project-new" &&
          isTabInScope(tab, activeProjectId) &&
          (!onWorkspace || tab.id !== activeTabId)
      ),
    [tabs, activeProjectId, activeTabId, onWorkspace]
  );
  const values = useMemo(
    () => uniqueValues(targets.map((tab) => t("screens4_4.globalCommands.goToTab", { title: tabDisplayTitle(tab) }))),
    [targets, t]
  );

  const switchTo = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab.id);
      showWorkspace();
    },
    [setActiveTab]
  );

  if (targets.length === 0) {
    return null;
  }

  return (
    <Command.Group heading={t("screens4_4.globalCommands.openTabs")}>
      {targets.map((tab, index) => (
        <Command.Item
          key={tab.id}
          value={values[index]}
          keywords={[tab.type]}
          onSelect={() => runCommandAndClose(() => switchTo(tab))}
        >
          <Glyph>{TYPE_GLYPH[tab.type]}</Glyph> {tabDisplayTitle(tab)}
        </Command.Item>
      ))}
    </Command.Group>
  );
});

/** App pages and destinations: the same list the rail and logo menu show. */
const NavigateCommands = memo(function NavigateCommands() {
  const { t } = useTranslation();
  const appActions = useAppMenuActions();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const openProjects = useCallback(() => {
    openTab({
      type: "project-list",
      ref: PROJECT_LIST_REF,
      mode: "view",
      title: t("screens4_4.globalCommands.projects")
    });
    showWorkspace();
  }, [openTab, t]);

  return (
    <Command.Group heading={t("screens4_4.globalCommands.goTo")}>
      {window.location.pathname !== WORKSPACE_PATH && (
        <Command.Item
          value={t("screens4_4.globalCommands.workspace")}
          onSelect={() => runCommandAndClose(() => navigateTo(WORKSPACE_PATH))}
        >
          <SpaceDashboardOutlinedIcon /> {t("screens4_4.globalCommands.workspace")}
        </Command.Item>
      )}
      <Command.Item
        value={t("screens4_4.globalCommands.projects")}
        onSelect={() => runCommandAndClose(openProjects)}
      >
        <Glyph>{PROJECT_GLYPH}</Glyph> {t("screens4_4.globalCommands.projects")}
      </Command.Item>
      {appActions.map((action) => (
        <Command.Item
          key={action.key}
          value={action.label}
          onSelect={() =>
            runCommandAndClose(() => {
              action.onClick();
              // Page tabs open in the workspace; Help and Downloads are
              // dialogs that show over any route.
              if (action.key !== "help" && action.key !== "downloads") {
                showWorkspace();
              }
            })
          }
        >
          {action.icon} {action.label}
          {action.secondary ? ` (${action.secondary})` : null}
        </Command.Item>
      ))}
      <Command.Item
        value={t("screens4_4.globalCommands.studio")}
        onSelect={() => runCommandAndClose(() => navigateTo("/studio"))}
      >
        <MovieFilterOutlinedIcon /> {t("screens4_4.globalCommands.studio")}
      </Command.Item>
    </Command.Group>
  );
});

/** Every project, so switching projects does not need the tab bar. */
const ProjectCommands = memo(function ProjectCommands() {
  const { t } = useTranslation();
  const { data: projects } = useProjects();
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const openProject = useOpenProject();

  const targets = useMemo(
    () => (projects ?? []).filter((project) => project.id !== activeProjectId),
    [projects, activeProjectId]
  );
  const values = useMemo(
    () =>
      uniqueValues(
        targets.map(
          (project) =>
            t("screens4_4.globalCommands.switchToProject", { name: project.isPersonal ? t("screens4_4.globalCommands.personal") : project.name })
        )
      ),
    [targets, t]
  );

  if (targets.length === 0) {
    return null;
  }

  return (
    <Command.Group heading={t("screens4_4.globalCommands.projects")}>
      {targets.map((project, index) => {
        const name = project.isPersonal ? t("screens4_4.globalCommands.personal") : project.name;
        return (
          <Command.Item
            key={project.id}
            value={values[index]}
            onSelect={() =>
              runCommandAndClose(async () => {
                if (await openProject({ id: project.id, name })) {
                  showWorkspace();
                }
              })
            }
          >
            <Glyph>{PROJECT_GLYPH}</Glyph> {name}
          </Command.Item>
        );
      })}
    </Command.Group>
  );
});

/** The `+ New` catalog, flattened: submenus become one item per choice. */
const CreateCommands = memo(function CreateCommands() {
  const { t } = useTranslation();
  const catalog = useNewDocumentCatalog({}, showWorkspace);
  const templateLabels: Record<string, string> = {
    "Untitled.md": t("screens4_4.globalCommands.templates.markdown"),
    "Untitled.json": t("screens4_4.globalCommands.templates.json"),
    "Untitled.yaml": t("screens4_4.globalCommands.templates.yaml"),
    "Untitled.csv": t("screens4_4.globalCommands.templates.csv"),
    "Untitled.tsv": t("screens4_4.globalCommands.templates.tsv"),
    "Untitled.txt": t("screens4_4.globalCommands.templates.plainText")
  };
  const entryLabels: Record<string, string> = {
    workflow: t("screens4_4.globalCommands.createEntries.workflow"),
    chat: t("screens4_4.globalCommands.createEntries.chat"),
    text: t("screens4_4.globalCommands.createEntries.text"),
    image: t("screens4_4.globalCommands.createEntries.image"),
    svg: t("screens4_4.globalCommands.createEntries.svg"),
    video: t("screens4_4.globalCommands.createEntries.video"),
    storyboard: t("screens4_4.globalCommands.createEntries.storyboard"),
    app: t("screens4_4.globalCommands.createEntries.app"),
    script: t("screens4_4.globalCommands.createEntries.script"),
    jsscript: t("screens4_4.globalCommands.createEntries.jsscript"),
    skill: t("screens4_4.globalCommands.createEntries.skill"),
    model3d: t("screens4_4.globalCommands.createEntries.model3d")
  };

  return (
    <Command.Group heading={t("screens4_4.globalCommands.create")}>
      {catalog.entries.map((entry) => {
        if (entry.submenu === "texts") {
          return TEXT_FILE_TEMPLATES.map((template) => (
            <Command.Item
              key={`text-${template.filename}`}
              value={t("screens4_4.globalCommands.newTextFileValue", { label: templateLabels[template.filename] ?? template.label })}
              onSelect={() =>
                runCommandAndClose(() => catalog.createTextFile(template))
              }
            >
              {entry.icon} {t("screens4_4.globalCommands.newTextFile", { label: templateLabels[template.filename] ?? template.label })}
            </Command.Item>
          ));
        }
        if (entry.submenu === "storyboards") {
          return (
            <Command.Item
              key={entry.key}
              value={t("screens4_4.globalCommands.newStoryboard")}
              onSelect={() =>
                runCommandAndClose(catalog.createBlankStoryboard)
              }
            >
            {entry.icon} {t("screens4_4.globalCommands.newStoryboard")}
            </Command.Item>
          );
        }
        const create = entry.create;
        if (!create) {
          return null;
        }
        return (
          <Command.Item
            key={entry.key}
            value={entryLabels[entry.key] ?? entry.menuLabel}
            onSelect={() => runCommandAndClose(create)}
          >
            {entry.icon} {entryLabels[entry.key] ?? entry.menuLabel}
          </Command.Item>
        );
      })}
    </Command.Group>
  );
});

/**
 * App bundle commands, mirroring the workflow bundle ones. An app bundle is
 * one JSON file carrying the app plus the graph of every workflow it binds, so
 * export needs an app tab open and import creates both the workflows and the
 * app, then opens it.
 */
const AppCommands = memo(function AppCommands() {
  const { t } = useTranslation();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const queryClient = useQueryClient();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const applicationId = useWorkspaceTabsStore((state) => {
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    return tab?.type === "application" ? tab.ref : null;
  });
  const applicationName = useWorkspaceTabsStore((state) => {
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    return tab?.type === "application" ? tab.title : "";
  });
  const appBundleInputRef = useRef<HTMLInputElement>(null);

  const exportApp = useCallback(async () => {
    if (!applicationId) return;
    try {
      await exportApplicationBundle(applicationId, applicationName || "app");
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: t("screens4_4.globalCommands.exportBundleFailed", { error: error instanceof Error ? error.message : t("screens4_4.globalCommands.unknownError") })
      });
    }
  }, [applicationId, applicationName, addNotification, t]);

  const exportProject = useCallback(async () => {
    if (!applicationId) return;
    try {
      await exportApplicationProject(applicationId, applicationName || "app");
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: t("screens4_4.globalCommands.exportProjectFailed", { error: error instanceof Error ? error.message : t("screens4_4.globalCommands.unknownError") })
      });
    }
  }, [applicationId, applicationName, addNotification, t]);

  const handleAppBundleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      useCommandMenuStore.getState().setOpen(false);
      try {
        const projectId = creationProjectId();
        const app = await importApplicationBundle(file, projectId);
        await queryClient.invalidateQueries({ queryKey: ["applications"] });
        await queryClient.invalidateQueries({ queryKey: ["workflows"] });
        openTab({ type: "application", ref: app.id, title: app.name, projectId });
        showWorkspace();
        addNotification({
          type: "success",
          alert: true,
          content: t("screens4_4.globalCommands.importedApp", { name: app.name })
        });
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: t("screens4_4.globalCommands.importBundleFailed", { error: error instanceof Error ? error.message : t("screens4_4.globalCommands.unknownError") })
        });
      }
      if (appBundleInputRef.current) appBundleInputRef.current.value = "";
    },
    [queryClient, openTab, addNotification, t]
  );

  return (
    <>
      <input
        ref={appBundleInputRef}
        type="file"
        accept=".json,application/json"
        aria-label={t("screens4_4.globalCommands.importAppBundleFile")}
        style={{ display: "none" }}
        onChange={handleAppBundleFileChange}
      />
      <Command.Group heading={t("screens4_4.globalCommands.app")}>
        {applicationId && (
          <Command.Item onSelect={() => runCommandAndClose(exportApp)}>
            <FolderZipRoundedIcon /> {t("screens4_4.globalCommands.exportAppBundle")}
          </Command.Item>
        )}
        {applicationId && (
          <Command.Item onSelect={() => runCommandAndClose(exportProject)}>
            <FolderZipRoundedIcon /> {t("screens4_4.globalCommands.exportAppProject")}
          </Command.Item>
        )}
        {/* The file picker must open inside the click's user activation, so
            this one item keeps the menu open until the picker returns. */}
        <Command.Item
          onSelect={() => {
            appBundleInputRef.current?.click();
          }}
        >
          <FolderZipRoundedIcon /> {t("screens4_4.globalCommands.importAppBundle")}
        </Command.Item>
      </Command.Group>
    </>
  );
});

const HelpCommands = memo(function HelpCommands() {
  const { t } = useTranslation();
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const setHelpIndex = useAppHeaderStore((state) => state.setHelpIndex);
  const handleOpenHelp = useAppHeaderStore((state) => state.handleOpenHelp);

  return (
    <Command.Group heading={t("screens4_4.globalCommands.help")}>
      <Command.Item
        onSelect={() =>
          runCommandAndClose(() => {
            setHelpIndex(1);
            handleOpenHelp();
          })
        }
      >
        <KeyboardRoundedIcon /> {t("screens4_4.globalCommands.keyboardShortcuts")}
      </Command.Item>
      <Command.Item
        onSelect={() =>
          runCommandAndClose(() =>
            openBugReport({
              source: "manual",
              workflowId: currentWorkflowId ?? undefined
            })
          )
        }
      >
        <BugReportIcon /> {t("screens4_4.globalCommands.reportBug")}
      </Command.Item>
    </Command.Group>
  );
});

/** Matches the default page size of `WorkflowManagerStore.load`. */
const COMMAND_MENU_WORKFLOW_LIMIT = 100;

const OpenWorkflowCommands = memo(function OpenWorkflowCommands() {
  const { t } = useTranslation();
  const load = useWorkflowManager((state) => state.load);

  const { data: workflows } = useQuery<WorkflowList>({
    queryKey: workflowListQueryKey(COMMAND_MENU_WORKFLOW_LIMIT),
    queryFn: () => load("", COMMAND_MENU_WORKFLOW_LIMIT)
  });

  const openWorkflow = useCallback((workflow: Workflow) => {
    navigateTo("/editor/" + workflow.id);
  }, []);
  const values = useMemo(
    () =>
      uniqueValues(
        (workflows?.workflows ?? []).map(
          (workflow) => t("screens4_4.globalCommands.openWorkflowValue", { name: workflow.name })
        )
      ),
    [workflows, t]
  );

  if (!workflows || workflows.workflows.length === 0) {
    return null;
  }

  return (
    <Command.Group heading={t("screens4_4.globalCommands.workflows")}>
      {workflows.workflows.map((workflow, index) => (
        <Command.Item
          key={workflow.id}
          value={values[index]}
          onSelect={() => runCommandAndClose(() => openWorkflow(workflow))}
        >
          <FolderOpenRoundedIcon /> {workflow.name}
        </Command.Item>
      ))}
    </Command.Group>
  );
});

/** Everything below the open tabs and any view-specific groups. */
const GlobalCommandGroups = () => (
  <>
    <NavigateCommands />
    <ProjectCommands />
    <CreateCommands />
    <AppCommands />
    <HelpCommands />
    <OpenWorkflowCommands />
  </>
);

export default memo(GlobalCommandGroups);
