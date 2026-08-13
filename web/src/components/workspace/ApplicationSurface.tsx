import { memo, useCallback, useState, type MouseEvent } from "react";

import ApplicationGovernancePanel from "../applications/ApplicationGovernancePanel";
import ApplicationAppBuilder from "../appbuilder/ApplicationAppBuilder";
import ApplicationRunView from "../appbuilder/ApplicationRunView";
import LinkedWorkflowsMenu from "./LinkedWorkflowsMenu";
import { useApplication } from "../../hooks/useApplications";
import { tabId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import {
  Box,
  Caption,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  Text,
  ToggleGroup,
  ToggleOption,
  SPACING
} from "../ui_primitives";

export interface ApplicationSurfaceProps {
  refId: string;
}

type ApplicationView = "design" | "run" | "settings";

/**
 * Each view is a layer, and a layer stays mounted once it has been opened —
 * the same trick the workspace shell plays with its tabs, for the same reason.
 * Rendering only the active view unmounted the whole builder on the way to Run
 * and back: the Puck canvas re-seeded from the saved document (losing unsaved
 * edits), operations and variables reset, and the agent panel opened a new
 * thread, so the conversation was gone too.
 */
const LAYER_SX = { position: "absolute", inset: 0 } as const;
const ACTIVE_LAYER_SX = { ...LAYER_SX, opacity: 1, pointerEvents: "auto" } as const;
const HIDDEN_LAYER_SX = {
  ...LAYER_SX,
  opacity: 0,
  pointerEvents: "none"
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
  // Background tabs stay mounted, so the linked graphs only load once this
  // app is the focused tab.
  const isActiveTab = useWorkspaceTabsStore(
    (state) => state.activeTabId === tabId("application", refId)
  );

  const handleViewChange = useCallback(
    (_event: MouseEvent<HTMLElement>, next: ApplicationView | null) => {
      if (!next) return;
      setView(next);
      setOpened((views) => (views.includes(next) ? views : [...views, next]));
    },
    []
  );

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

  return (
    <FlexColumn gap={0} fullWidth sx={{ height: "100%", minHeight: 0 }}>
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
          <LinkedWorkflowsMenu applicationId={application.id} active={isActiveTab} />
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
            <ApplicationAppBuilder applicationId={application.id} />
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
      </Box>
    </FlexColumn>
  );
};

export default memo(ApplicationSurface);
