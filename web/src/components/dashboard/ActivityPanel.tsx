/** @jsxImportSource @emotion/react */
import React, { useState, useCallback } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Theme } from "@mui/material/styles";
import WorkflowList from "../workflows/WorkflowList";
import RecentChats from "./RecentChats";
import { Thread } from "../../stores/ApiTypes";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import ContextMenus from "../context_menus/ContextMenus";
import { FlexColumn } from "../ui_primitives";

interface ActivityPanelProps {
  // Chat props
  threads: { [key: string]: Thread };
  currentThreadId: string | null;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  getThreadPreview: (threadId: string) => string;
}

const styles = (theme: Theme) =>
  css({
    height: "100%",
    borderRadius: theme.spacing(1),
    boxShadow: `0 2px 8px ${theme.vars.palette.grey[900]}1a`,
    background: theme.vars.palette.c_editor_bg_color,
    ".panel-header": {
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      background: theme.vars.palette.action.hover
    },
    ".panel-content": {
      flex: 1,
      overflow: "hidden",
      position: "relative"
    },
    ".MuiTabs-root": {
      minHeight: "48px"
    },
    ".MuiTab-root": {
      textTransform: "none",
      fontWeight: 500,
      fontSize: "0.95rem",
      minHeight: "48px"
    },
    // Override child component styles to fit in tab panel
    ".workflows-list, .recent-chats": {
      boxShadow: "none",
      padding: "1em",
      height: "100%",
      background: "transparent"
    },
    ".section-title": {
      display: "none" // Hide titles since we have tabs
    }
  });

const ActivityPanel: React.FC<ActivityPanelProps> = (props) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = useCallback((event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  }, []);

  return (
    <FlexColumn gap={0} fullHeight css={styles(theme)} className="activity-panel">
      <Box className="panel-header">
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="activity tabs"
          variant="fullWidth"
          indicatorColor="primary"
          textColor="primary"
        >
          <Tab label="Workflows" />
          <Tab label="Recent Chats" />
        </Tabs>
      </Box>
      <Box className="panel-content">
        <div
          role="tabpanel"
          hidden={activeTab !== 0}
          id="activity-tabpanel-0"
          aria-labelledby="activity-tab-0"
          style={{ height: "100%" }}
        >
          {activeTab === 0 && (
            <ContextMenuProvider>
              <ContextMenus />
              <WorkflowList />
            </ContextMenuProvider>
          )}
        </div>
        <div
          role="tabpanel"
          hidden={activeTab !== 1}
          id="activity-tabpanel-1"
          aria-labelledby="activity-tab-1"
          style={{ height: "100%" }}
        >
          {activeTab === 1 && (
            <RecentChats
              threads={props.threads}
              currentThreadId={props.currentThreadId}
              onNewThread={props.onNewThread}
              onSelectThread={props.onSelectThread}
              onDeleteThread={props.onDeleteThread}
              getThreadPreview={props.getThreadPreview}
            />
          )}
        </div>
      </Box>
    </FlexColumn>
  );
};

export default React.memo(ActivityPanel);
