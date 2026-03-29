/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Popover,
  Tooltip,
  Typography
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTheme } from "@mui/material/styles";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { CopyButton } from "../ui_primitives";

const popoverStyles = css({
  paddingRight: "4em",
  marginTop: "2em",
  "& .copy-button": {
    position: "absolute",
    opacity: 0.8,
    top: "5px",
    right: "0px"
  }
});

/**
 * Generate an accessible ARIA label for the notification button.
 * Describes the number of unread notifications to screen readers.
 */
const getNotificationButtonLabel = (unreadCount: number): string => {
  if (unreadCount === 0) {
    return "Notifications, no unread notifications";
  }
  if (unreadCount === 1) {
    return "Notifications, 1 unread notification";
  }
  return `Notifications, ${unreadCount} unread notifications`;
};

const NotificationButton: React.FC = React.memo(() => {
  const [notificationAnchor, setNotificationAnchor] =
    useState<null | HTMLElement>(null);
  const notifications = useNotificationStore((state) => state.notifications);
  const lastDisplayedTimestamp = useNotificationStore((state) => state.lastDisplayedTimestamp);
  const updateLastDisplayedTimestamp = useNotificationStore((state) => state.updateLastDisplayedTimestamp);
  const theme = useTheme();
  const unreadCount = useMemo(() => {
    if (!lastDisplayedTimestamp) {return notifications.length;}
    return notifications.filter((n) => n.timestamp > lastDisplayedTimestamp)
      .length;
  }, [notifications, lastDisplayedTimestamp]);

  const handleNotificationClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setNotificationAnchor(event.currentTarget);
      updateLastDisplayedTimestamp(new Date());
    },
    [updateLastDisplayedTimestamp]
  );

  const handleNotificationClose = useCallback(() => {
    setNotificationAnchor(null);
  }, []);

  return (
    <div className="notifications-container">
      <Tooltip title="Notifications" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className="notification-button command-button command-icon"
          onClick={handleNotificationClick}
          aria-label={getNotificationButtonLabel(unreadCount)}
          aria-live="polite"
          aria-atomic="true"
          sx={{
            "& .MuiBadge-badge": {
              fontSize: "0.75rem",
              minWidth: "18px",
              height: "18px",
              padding: "0 4px"
            }
          }}
        >
          <Badge
            badgeContent={unreadCount}
            color="error"
            className="notification-badge"
            aria-label={`${unreadCount} unread`}
          >
            <NotificationsIcon
              sx={{ fontSize: "18px" }}
              className="notification-icon"
            />
          </Badge>
        </Button>
      </Tooltip>
      <Popover
        css={popoverStyles}
        className="notification-popover"
        open={Boolean(notificationAnchor)}
        anchorEl={notificationAnchor}
        onClose={handleNotificationClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        sx={{
          "& .MuiPopover-paper": {
            backdropFilter: "blur(8px)",
            backgroundColor: `${theme.vars.palette.grey[900]}E6`,
            boxShadow: "0 16px 64px rgba(0, 0, 0, 0.4)",
            border: `1px solid ${theme.vars.palette.grey[800]}`
          }
        }}
      >
        <Box
          className="notification-container"
          role="region"
          aria-label="Notifications"
          sx={{
            p: 3,
            width: "600px",
            maxHeight: "600px",
            overflow: "auto",
            "&::-webkit-scrollbar": {
              width: "6px"
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: theme.vars.palette.grey[600],
              borderRadius: "3px"
            }
          }}
        >
          {notifications.length === 0 ? (
            <Typography
              className="notification-empty-message"
              color="textSecondary"
              role="status"
              aria-live="polite"
              sx={{ fontSize: "0.9rem", fontWeight: 300 }}
            >
              No notifications
            </Typography>
          ) : (
            <Box role="list" aria-label={`Notification list, ${notifications.length} item${notifications.length > 1 ? "s" : ""}`}>
              {notifications.map((notification) => (
                <Box
                  key={notification.id}
                  role="listitem"
                  className={`notification-item notification-type-${notification.type}`}
                  aria-label={`${notification.type} notification: ${notification.content}`}
                  sx={{
                    p: 2,
                    mb: 1.5,
                    borderRadius: 1.5,
                    maxHeight: "100px",
                    overflow: "auto",
                    backgroundColor: `${theme.vars.palette.grey[800]}CC`,
                    borderLeft: `3px solid ${
                      notification.type === "error"
                        ? theme.vars.palette.error.main
                        : notification.type === "warning"
                        ? theme.vars.palette.warning.main
                        : notification.type === "success"
                        ? theme.vars.palette.success.main
                        : notification.type === "info"
                        ? theme.vars.palette.info.main
                        : theme.vars.palette.grey[600]
                    }`,
                    transition: "all 0.2s ease",
                    position: "relative",
                    "&:hover": {
                      backgroundColor: theme.vars.palette.grey[800]
                    }
                  }}
                >
                <Typography
                  variant="body2"
                  color="textPrimary"
                  className="notification-content"
                  sx={{
                    fontSize: "0.85rem",
                    lineHeight: 1.5,
                    wordWrap: "break-word",
                    pr: 3
                  }}
                >
                  {notification.content}
                </Typography>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    className="notification-timestamp"
                    sx={{
                      fontSize: "0.75rem",
                      display: "block",
                      mt: 0.5
                    }}
                  >
                    {notification.timestamp.toLocaleString()}
                  </Typography>
                  <CopyButton
                    value={notification.content}
                    className="copy-button"
                    tooltip="Copy to clipboard"
                  />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Popover>
    </div>
  );
});

NotificationButton.displayName = "NotificationButton";

export default NotificationButton;
