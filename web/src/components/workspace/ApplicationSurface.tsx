import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent
} from "react";
import { useMutation } from "@tanstack/react-query";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloseIcon from "@mui/icons-material/Close";
import {
  parseApplicationDocument,
  type AppDocument
} from "../appbuilder/appData";

import {
  defaultAppInstance,
  type ServerAppInstance
} from "../appbuilder/runtime/appInstanceApi";
import {
  loadPersistedVariables,
  clearPersistedVariables
} from "../appbuilder/runtime/variablePersistence";
import ApplicationGovernancePanel from "../applications/ApplicationGovernancePanel";
import ApplicationAppBuilder from "../appbuilder/ApplicationAppBuilder";
import ApplicationRunView from "../appbuilder/ApplicationRunView";
import AppBuilderAgentPanel from "../appbuilder/AppBuilderAgentPanel";
import LinkedWorkflowsMenu from "./LinkedWorkflowsMenu";
import { useApplication } from "../../hooks/useApplications";
import { trpcClient } from "../../trpc/client";
import ReportBugButton from "../support/ReportBugButton";
import {
  tabId,
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import ResizableSideDock from "../chat/assistant/ResizableSideDock";
import {
  Box,
  AlertBanner,
  Caption,
  CircularActionButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  Text,
  ToggleGroup,
  ToggleOption,
  SPACING,
  Z_INDEX
} from "../ui_primitives";

interface ApplicationSurfaceProps {
  refId: string;
  instanceId?: string;
  selectedRunId?: string;
  mode?: WorkspaceTabMode;
}

type ApplicationView = "design" | "run" | "preview" | "settings";

/**
 * Each view is a layer, and a layer stays mounted once it has been opened —
 * the same trick the workspace shell plays with its tabs, for the same reason.
 * Rendering only the active view unmounted the whole builder on the way to Run
 * and back: the Puck canvas re-seeded from the saved document (losing unsaved
 * edits) and operations and variables reset. The assistant docks on this
 * surface, so it stays on the right in every view and keeps its thread.
 */
const LAYER_SX = { position: "absolute", inset: 0 } as const;
const ACTIVE_LAYER_SX = {
  ...LAYER_SX,
  opacity: 1,
  pointerEvents: "auto"
} as const;
const HIDDEN_LAYER_SX = {
  ...LAYER_SX,
  opacity: 0,
  pointerEvents: "none"
} as const;

const MIN_DOCKED_SURFACE_WIDTH = 960;

const overlayPanelSx = {
  position: "absolute",
  inset: 0,
  width: "100%",
  overflow: "hidden",
  backgroundColor: "background.default",
  zIndex: Z_INDEX.overlay
} as const;

/**
 * Workspace surface for a mini app: the WYSIWYG canvas over the app's own
 * document, plus its publish and governance controls.
 */
const ApplicationSurface = ({
  refId,
  instanceId,
  selectedRunId,
  mode = "view"
}: ApplicationSurfaceProps) => {
  const {
    data: application,
    isLoading,
    isError,
    error
  } = useApplication(refId);
  const [view, setView] = useState<ApplicationView>(
    mode === "view" ? "run" : "design"
  );
  useEffect(() => {
    const next = mode === "view" ? "run" : "design";
    setView(next);
    setOpened((views) => (views.includes(next) ? views : [...views, next]));
  }, [mode]);
  // A view is mounted the first time it is opened, and never unmounted after.
  const [opened, setOpened] = useState<ApplicationView[]>(
    mode === "view" ? ["run"] : ["design"]
  );
  // The first operation's graph, reported by the builder as it binds. The
  // assistant lives on this surface, so a Design bind reaches it in Run too.
  const [agentWorkflowId, setAgentWorkflowId] = useState<string | undefined>();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [draftDocument, setDraftDocument] = useState<AppDocument>();
  const saveDraftRef = useRef<(() => Promise<string>) | null>(null);
  const registerSave = useCallback((save: () => Promise<string>) => {
    saveDraftRef.current = save;
  }, []);
  const beforePublish = useCallback(async () => {
    if (opened.includes("design")) {
      if (!saveDraftRef.current) {
        throw new Error("The app editor is still loading.");
      }
      return await saveDraftRef.current();
    }
  }, [opened]);
  useEffect(() => {
    const element = surfaceRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setNarrow(entry.contentRect.width < MIN_DOCKED_SURFACE_WIDTH);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isLoading, isError]);
  const [narrowAgentOpen, setNarrowAgentOpen] = useState(false);
  const narrowAgentPanelRef = useRef<HTMLDivElement>(null);
  const narrowAgentButtonRef = useRef<HTMLButtonElement>(null);
  const wasNarrowAgentOpen = useRef(false);
  const toggleNarrowAgent = useCallback(
    () => setNarrowAgentOpen((open) => !open),
    []
  );
  useEffect(() => {
    if (!narrow) return;
    if (narrowAgentOpen && !wasNarrowAgentOpen.current) {
      narrowAgentPanelRef.current?.focus();
    } else if (!narrowAgentOpen && wasNarrowAgentOpen.current) {
      narrowAgentButtonRef.current?.focus();
    }
    wasNarrowAgentOpen.current = narrowAgentOpen;
  }, [narrow, narrowAgentOpen]);
  // Background tabs stay mounted, so the linked graphs only load once this
  // app is the focused tab.
  const isActiveTab = useWorkspaceTabsStore(
    (state) => state.activeTabId === tabId("application", refId, instanceId)
  );
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const openWorkingInstance = useMutation({
    mutationFn: async () => {
      if (!application) {
        throw new Error("The app is still loading.");
      }
      const release = await trpcClient.applications.releasedDocument.query({
        id: application.id
      });
      const document = parseApplicationDocument(
        release?.document ?? application.document
      );
      if (!document) {
        throw new Error("The app definition could not be loaded.");
      }
      const instance = await defaultAppInstance({
        application_id: application.id,
        source_id: `application:${application.id}`,
        ...(release ? { version: release.version } : {}),
        snapshot: { document, workflow_graphs: {}, script_documents: {} },
        variables: loadPersistedVariables(
          `application:${application.id}`,
          document.variables
        )
      });
      clearPersistedVariables(`application:${application.id}`);
      return instance;
    },
    onSuccess: (instance) => {
      openTab({
        type: "application",
        ref: refId,
        instanceId: instance.id,
        title: instance.name,
        projectId: application?.projectId,
        mode: "view"
      });
    },
    retry: false
  });

  const [previewDocument, setPreviewDocument] = useState<AppDocument>();
  const resolveInstance = useWorkspaceTabsStore(
    (state) => state.resolveApplicationInstance
  );
  const selectRun = useWorkspaceTabsStore(
    (state) => state.setApplicationRunSelection
  );
  const onInstanceReady = useCallback(
    (instance: ServerAppInstance) => {
      if (mode === "view") {
        resolveInstance(refId, instance.id, instance.name);
      }
    },
    [mode, refId, resolveInstance]
  );
  const onSelectRun = useCallback(
    (id: string | null) => {
      selectRun(tabId("application", refId, instanceId), id);
    },
    [refId, instanceId, selectRun]
  );
  const handleViewChange = useCallback(
    (_event: MouseEvent<HTMLElement>, next: ApplicationView | null) => {
      if (!next) return;
      if (next === "run" && mode === "edit") {
        const existing = tabs.find(
          (tab) =>
            tab.type === "application" && tab.ref === refId && tab.instanceId
        );
        if (existing) {
          openTab({
            type: "application",
            ref: refId,
            instanceId: existing.instanceId,
            title: existing.title,
            projectId: existing.projectId,
            mode: "view"
          });
        } else if (!openWorkingInstance.isPending) {
          openWorkingInstance.mutate();
        }
        return;
      }
      if (next === "preview") {
        const frozen = parseApplicationDocument(
          draftDocument ?? application?.document
        );
        if (frozen) {
          setPreviewDocument(structuredClone(frozen));
        }
      }
      setView(next);
      const mountedView = next === "preview" ? "run" : next;
      setOpened((views) =>
        views.includes(mountedView) ? views : [...views, mountedView]
      );
    },
    [
      draftDocument,
      application?.document,
      mode,
      tabs,
      refId,
      openTab,
      openWorkingInstance
    ]
  );

  useEffect(() => {
    if (!application || instanceId) return;
    setTabTitle(refId, "application", application.name || "Untitled app");
  }, [application, refId, instanceId, setTabTitle]);

  if (isLoading) {
    return <LoadingSpinner size="large" text="Loading app" />;
  }

  if (isError || !application) {
    return (
      <EmptyState
        variant="error"
        title="Could not load app"
        description={error?.message ?? "The app may have been deleted."}
      />
    );
  }

  const assistant = (
    <AppBuilderAgentPanel
      applicationId={application.id}
      workflowId={agentWorkflowId}
    />
  );
  const isRunView = view === "run" || view === "preview";

  return (
    <FlexRow
      ref={surfaceRef}
      gap={0}
      sx={{ width: "100%", height: "100%", minHeight: 0, position: "relative" }}
    >
      <FlexColumn
        gap={0}
        sx={{ flex: 1, minWidth: 0, height: "100%", minHeight: 0 }}
      >
        {mode === "edit" && (
          <FlexRow
            align="center"
            justify="space-between"
            gap={SPACING.md}
            sx={{
              px: SPACING.lg,
              py: SPACING.md,
              borderBottom: "1px solid",
              borderColor: "divider",
              backgroundColor: "background.paper"
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Text size="small" weight={600} truncate>
                {application.name || "Untitled app"}
              </Text>
              {application.description && (
                <Caption color="secondary" sx={{ display: "block" }}>
                  {application.description}
                </Caption>
              )}
            </Box>
            <FlexRow align="center" gap={SPACING.sm}>
              <LinkedWorkflowsMenu
                applicationId={application.id}
                active={isActiveTab}
              />
              <ToggleGroup
                segmented
                exclusive
                value={view}
                onChange={handleViewChange}
                aria-label="App view"
              >
                <ToggleOption value="design">Design</ToggleOption>
                <ToggleOption value="run">Run</ToggleOption>
                <ToggleOption value="preview">Preview draft</ToggleOption>
                <ToggleOption value="settings">Settings</ToggleOption>
              </ToggleGroup>
            </FlexRow>
          </FlexRow>
        )}
        {openWorkingInstance.error && (
          <AlertBanner severity="error">
            {openWorkingInstance.error.message}
            <ReportBugButton
              context={{
                source: "operation-failure",
                summary: "Could not open app instance",
                errorText: openWorkingInstance.error.message
              }}
            />
          </AlertBanner>
        )}
        <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
          {opened.includes("design") && (
            <Box
              data-testid="application-design-layer"
              aria-hidden={view !== "design"}
              inert={view !== "design"}
              sx={view === "design" ? ACTIVE_LAYER_SX : HIDDEN_LAYER_SX}
            >
              <ApplicationAppBuilder
                applicationId={application.id}
                onAgentWorkflowIdChange={setAgentWorkflowId}
                onDraftChange={setDraftDocument}
                onSaveReady={registerSave}
              />
            </Box>
          )}
          {opened.includes("run") && (mode !== "edit" || previewDocument) && (
            <Box
              data-testid="application-run-layer"
              aria-hidden={!isRunView}
              inert={!isRunView}
              sx={isRunView ? ACTIVE_LAYER_SX : HIDDEN_LAYER_SX}
            >
              <ApplicationRunView
                applicationId={application.id}
                instanceId={instanceId}
                selectedRunId={selectedRunId}
                onSelectRun={onSelectRun}
                onInstanceReady={
                  view === "preview" ? undefined : onInstanceReady
                }
                previewDraft={mode === "edit" || view === "preview"}
                draftDocument={previewDocument}
              />
            </Box>
          )}
          {opened.includes("settings") && (
            <Box
              data-testid="application-settings-layer"
              aria-hidden={view !== "settings"}
              inert={view !== "settings"}
              sx={view === "settings" ? ACTIVE_LAYER_SX : HIDDEN_LAYER_SX}
            >
              <ScrollArea fullHeight>
                <FlexColumn gap={SPACING.lg} padding={SPACING.xl} fullWidth>
                  <ApplicationGovernancePanel
                    applicationId={application.id}
                    beforePublish={beforePublish}
                  />
                </FlexColumn>
              </ScrollArea>
            </Box>
          )}
          {mode === "edit" && narrow && (
            <Box
              ref={narrowAgentPanelRef}
              role="dialog"
              aria-label="App builder assistant"
              tabIndex={-1}
              sx={{
                ...overlayPanelSx,
                display: narrowAgentOpen ? "block" : "none"
              }}
            >
              {assistant}
            </Box>
          )}
        </Box>
      </FlexColumn>
      {mode === "edit" && !narrow && (
        <ResizableSideDock
          storageKey="app_builder"
          defaultWidth={420}
          ariaLabel="Resize app builder assistant"
        >
          {assistant}
        </ResizableSideDock>
      )}
      {mode === "edit" && narrow && (
        <CircularActionButton
          ref={narrowAgentButtonRef}
          icon={narrowAgentOpen ? <CloseIcon /> : <AutoAwesomeIcon />}
          onClick={toggleNarrowAgent}
          ariaLabel={narrowAgentOpen ? "Close agent" : "Ask Agent"}
          tooltip={narrowAgentOpen ? "Close agent" : "Ask Agent"}
          tooltipPlacement="top"
          size={48}
          position="absolute"
          bottom={SPACING.xl}
          right={SPACING.xl}
          zIndex={Z_INDEX.modal}
        />
      )}
    </FlexRow>
  );
};

export default memo(ApplicationSurface);
