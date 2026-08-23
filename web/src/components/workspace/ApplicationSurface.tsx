import { memo, useCallback, useEffect, useState, type MouseEvent } from "react";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloseIcon from "@mui/icons-material/Close";
import useMediaQuery from "@mui/material/useMediaQuery";

import ApplicationGovernancePanel from "../applications/ApplicationGovernancePanel";
import ApplicationAppBuilder from "../appbuilder/ApplicationAppBuilder";
import ApplicationRunView from "../appbuilder/ApplicationRunView";
import AppBuilderAgentPanel from "../appbuilder/AppBuilderAgentPanel";
import LinkedWorkflowsMenu from "./LinkedWorkflowsMenu";
import { useApplication } from "../../hooks/useApplications";
import { tabId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import ResizableSideDock from "../chat/assistant/ResizableSideDock";
import {
  Box,
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
}

type ApplicationView = "design" | "run" | "settings";

/**
 * Each view is a layer, and a layer stays mounted once it has been opened —
 * the same trick the workspace shell plays with its tabs, for the same reason.
 * Rendering only the active view unmounted the whole builder on the way to Run
 * and back: the Puck canvas re-seeded from the saved document (losing unsaved
 * edits) and operations and variables reset. The assistant docks on this
 * surface, so it stays on the right in every view and keeps its thread.
 */
const LAYER_SX = { position: "absolute", inset: 0 } as const;
const ACTIVE_LAYER_SX = { ...LAYER_SX, opacity: 1, pointerEvents: "auto" } as const;
const HIDDEN_LAYER_SX = {
  ...LAYER_SX,
  opacity: 0,
  pointerEvents: "none"
} as const;

/**
 * A 420px dock beside the canvas leaves too little of either below 638px, so
 * the assistant covers the surface and a floating button opens it from every
 * view.
 */
const NARROW_QUERY = "(max-width: 637.98px)";

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
const ApplicationSurface = ({ refId }: ApplicationSurfaceProps) => {
  const { data: application, isLoading, isError, error } = useApplication(refId);
  const [view, setView] = useState<ApplicationView>("design");
  // A view is mounted the first time it is opened, and never unmounted after.
  const [opened, setOpened] = useState<ApplicationView[]>(["design"]);
  // The first operation's graph, reported by the builder as it binds. The
  // assistant lives on this surface, so a Design bind reaches it in Run too.
  const [agentWorkflowId, setAgentWorkflowId] = useState<string | undefined>();
  const narrow = useMediaQuery(NARROW_QUERY);
  const [narrowAgentOpen, setNarrowAgentOpen] = useState(false);
  const toggleNarrowAgent = useCallback(
    () => setNarrowAgentOpen((open) => !open),
    []
  );
  // Background tabs stay mounted, so the linked graphs only load once this
  // app is the focused tab.
  const isActiveTab = useWorkspaceTabsStore(
    (state) => state.activeTabId === tabId("application", refId)
  );
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);

  const handleViewChange = useCallback(
    (_event: MouseEvent<HTMLElement>, next: ApplicationView | null) => {
      if (!next) return;
      setView(next);
      setOpened((views) => (views.includes(next) ? views : [...views, next]));
    },
    []
  );

  useEffect(() => {
    if (!application) return;
    setTabTitle(refId, "application", application.name || "Untitled app");
  }, [application, refId, setTabTitle]);

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

  return (
    <FlexRow
      gap={0}
      sx={{ width: "100%", height: "100%", minHeight: 0, position: "relative" }}
    >
      <FlexColumn
        gap={0}
        sx={{ flex: 1, minWidth: 0, height: "100%", minHeight: 0 }}
      >
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
              <ToggleOption value="settings">Settings</ToggleOption>
            </ToggleGroup>
          </FlexRow>
        </FlexRow>
        <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
          {opened.includes("design") && (
            <Box sx={view === "design" ? ACTIVE_LAYER_SX : HIDDEN_LAYER_SX}>
              <ApplicationAppBuilder
                applicationId={application.id}
                onAgentWorkflowIdChange={setAgentWorkflowId}
              />
            </Box>
          )}
          {opened.includes("run") && (
            <Box sx={view === "run" ? ACTIVE_LAYER_SX : HIDDEN_LAYER_SX}>
              <ApplicationRunView applicationId={application.id} />
            </Box>
          )}
          {opened.includes("settings") && (
            <Box sx={view === "settings" ? ACTIVE_LAYER_SX : HIDDEN_LAYER_SX}>
              <ScrollArea fullHeight>
                <FlexColumn gap={SPACING.lg} padding={SPACING.xl} fullWidth>
                  <ApplicationGovernancePanel applicationId={application.id} />
                </FlexColumn>
              </ScrollArea>
            </Box>
          )}
          {narrow && (
            <Box
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
      {!narrow && (
        <ResizableSideDock
          storageKey="app_builder"
          defaultWidth={420}
          ariaLabel="Resize app builder assistant"
        >
          {assistant}
        </ResizableSideDock>
      )}
      {narrow && (
        <CircularActionButton
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
