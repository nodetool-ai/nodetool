/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Drawer, Box } from "@mui/material";
import { memo } from "react";
import useWorkflowErrorPanelStore from "../../stores/WorkflowErrorPanelStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import WorkflowErrorPanel from "../workflow/WorkflowErrorPanel";

const DRAWER_WIDTH = 400;

const styles = (theme: Theme) =>
  css({
    "& .MuiDrawer-paper": {
      width: DRAWER_WIDTH,
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper,
      boxShadow: "-4px 0 12px rgba(0, 0, 0, 0.1)"
    }
  });

/**
 * WorkflowErrorDrawer is a slide-out drawer that displays the WorkflowErrorPanel.
 *
 * This component provides a drawer interface for viewing all workflow errors
 * with filtering and search capabilities.
 *
 * @returns Workflow error drawer component
 */
export const WorkflowErrorDrawer: React.FC = memo(() => {
  const theme = useTheme();
  const isOpen = useWorkflowErrorPanelStore((state) => state.isOpen);
  const closePanel = useWorkflowErrorPanelStore((state) => state.closePanel);
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);

  if (!currentWorkflowId) {
    return null;
  }

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={closePanel}
      css={styles(theme)}
      variant="persistent"
      sx={{
        "& .MuiDrawer-paper": {
          position: "fixed",
          height: "calc(100vh - 77px)",
          top: "77px",
          zIndex: 1099
        }
      }}
    >
      <Box sx={{ height: "100%", display: "flex" }}>
        <WorkflowErrorPanel
          workflowId={currentWorkflowId}
          onClose={closePanel}
        />
      </Box>
    </Drawer>
  );
});

WorkflowErrorDrawer.displayName = "WorkflowErrorDrawer";

export default WorkflowErrorDrawer;
