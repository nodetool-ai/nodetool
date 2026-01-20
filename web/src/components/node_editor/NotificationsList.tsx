/* @jsxImportSource @emotion/react */
import React, { memo, useMemo, useCallback } from "react";
import { useNotificationStore } from "../../stores/NotificationStore";
import { List, ListItem, ListItemText, Box, IconButton } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { NOTIFICATIONS_LIST_MAX_ITEMS } from "../../config/constants";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import { useClipboard } from "../../hooks/browser/useClipboard";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

const styles = (theme: Theme) =>
  css({
    "&": {
      height: "100%"
    },
    ul: {
      overflowY: "auto",
      height: "100%",
      maxHeight: "730px !important",
      paddingBottom: "5em",
      padding: "0.5em 1em"
    },
    li: {
      margin: "0.4em 0",
      padding: "0.5em 0.8em",
      borderBottom: "1px solid rgba(30, 30, 30, 0.1)",
      borderRadius: "4px",
      transition: "background-color 0.2s ease",
      position: "relative",
      "&:hover": {
        backgroundColor: "rgba(0, 0, 0, 0.02)"
      }
    },
    "li span.time": {
      fontFamily: theme.fontFamily1,
      fontSize: "0.65em",
      width: "4.5em",
      whiteSpace: "nowrap",
      flexShrink: 0,
      marginRight: "1.2em",
      color: theme.vars.palette.grey[400],
      opacity: 0.8
    },
    "li span.message": {
      fontSize: "0.8em",
      display: "block",
      overflow: "hidden auto",
      maxHeight: "10em",
      flex: 1,
      minWidth: 0,
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      overflowWrap: "break-word",
      lineHeight: "1.4",
      letterSpacing: "0.01em"
    },
    "li.info span.message": {
      color: theme.vars.palette.info.main
    },
    "li.debug span.message": {
      color: theme.vars.palette.c_debug
    },
    "li.error span.message": {
      color: theme.vars.palette.error.main
    },
    "li.warn span.message": {
      color: theme.vars.palette.warning.main
    },
    "li.warning span.message": {
      color: theme.vars.palette.warning.main
    },
    "li.progress span.message": {
      color: theme.vars.palette.c_progress
    },
    "li.node span.message": {
      color: theme.vars.palette.c_node
    },
    "li.job span.message": {
      color: theme.vars.palette.c_job
    },
    "li.success span.message": {
      color: theme.vars.palette.success.main
    },
    ".MuiListItemText-primary": {
      fontSize: "1em"
    },
    ".MuiListItemText-secondary": {
      fontSize: "0.6em"
    },
    ".copy-button": {
      position: "absolute",
      top: "0.5em",
      right: "0.5em",
      padding: "0.25em",
      opacity: 0,
      transition: "opacity 0.2s ease",
      "&:hover": {
        opacity: 1
      }
    },
    "li:hover .copy-button": {
      opacity: 0.7
    }
  });

const NotificationsList: React.FC = () => {
  const theme = useTheme();
  const notifications = useNotificationStore((state) => state.notifications);
  const { writeClipboard } = useClipboard();
  const recentNotifications = useMemo(
    () =>
      [...notifications]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, NOTIFICATIONS_LIST_MAX_ITEMS),
    [notifications]
  );

  const handleCopy = useCallback(
    async (content: string) => {
      await writeClipboard(content, true);
    },
    [writeClipboard]
  );

  return (
    <Box css={styles(theme)} className="notifications-list-container">
      <List dense className="notifications-list">
        {recentNotifications.map((notification) => (
          <ListItem
            className={`notification-item ${notification.type}`}
            key={notification.id}
          >
            <ListItemText
              className="notification-content"
              primary={
                <div style={{ display: "flex" }} className="notification-row">
                  <span className="time notification-timestamp">
                    {new Date(notification.timestamp).toLocaleTimeString(
                      "en-US",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false
                      }
                    )}
                  </span>
                  <span
                    className={`message notification-message ${notification.type}-message`}
                    style={{ wordWrap: "break-word" }}
                  >
                    {notification.content}
                  </span>
                </div>
              }
            />
            <IconButton
              className="copy-button"
              size="small"
              onClick={() => handleCopy(notification.content)}
              title="Copy to clipboard"
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default memo(NotificationsList, isEqual);
