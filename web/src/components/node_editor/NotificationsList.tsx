/* @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useNotificationStore } from "../../stores/NotificationStore";
import { List, ListItem, ListItemText, Box } from "@mui/material";
import { NOTIFICATIONS_LIST_MAX_ITEMS } from "../../config/constants";
import { css } from "@emotion/react";
import { isEqual } from "lodash";

const styles = (theme: any) =>
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
      color: theme.palette.c_gray4,
      opacity: 0.8
    },
    "li span.message": {
      fontFamily: theme.fontFamily,
      fontSize: "0.8em",
      display: "block",
      overflow: "hidden auto",
      maxHeight: "2.5em",
      flex: 1,
      minWidth: 0,
      whiteSpace: "normal",
      lineHeight: "1.4",
      letterSpacing: "0.01em"
    },
    "li.info span.message": {
      color: theme.palette.c_info
    },
    "li.debug span.message": {
      color: theme.palette.c_debug
    },
    "li.error span.message": {
      color: theme.palette.c_error
    },
    "li.warn span.message": {
      color: theme.palette.c_warning
    },
    "li.warning span.message": {
      color: theme.palette.c_warning
    },
    "li.progress span.message": {
      color: theme.palette.c_progress
    },
    "li.node span.message": {
      color: theme.palette.c_node
    },
    "li.job span.message": {
      color: theme.palette.c_job
    },
    "li.success span.message": {
      color: theme.palette.c_success
    },
    ".MuiListItemText-primary": {
      fontSize: "1em"
    },
    ".MuiListItemText-secondary": {
      fontSize: "0.6em"
    }
  });

const NotificationsList: React.FC = () => {
  const notifications = useNotificationStore((state) => state.notifications);
  const recentNotifications = [...notifications]
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, NOTIFICATIONS_LIST_MAX_ITEMS);

  return (
    <Box css={styles}>
      <List dense>
        {recentNotifications.map((notification) => (
          <ListItem className={notification.type} key={notification.id}>
            <ListItemText
              primary={
                <div style={{ display: "flex" }}>
                  <span className="time">
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
                  <span className="message">{notification.content}</span>
                </div>
              }
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default memo(NotificationsList, isEqual);
