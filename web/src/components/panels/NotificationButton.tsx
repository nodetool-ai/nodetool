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
import { useClipboard } from "../../hooks/browser/useClipboard";
import ThemeNodetool from "../themes/ThemeNodetool";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { CopyToClipboardButton } from "../common/CopyToClipboardButton";

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

const NotificationButton: React.FC = React.memo(() => {
  const [notificationAnchor, setNotificationAnchor] =
    useState<null | HTMLElement>(null);
  const {
    notifications,
    lastDisplayedTimestamp,
    updateLastDisplayedTimestamp
  } = useNotificationStore();
  const { writeClipboard } = useClipboard();

  const unreadCount = useMemo(() => {
    if (!lastDisplayedTimestamp) return notifications.length;
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

  const handleCopy = async (content: string) => {
    await writeClipboard(content, true);
  };

  return (
    <div className="notifications-container">
      <Tooltip title="Notifications" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className="notification-button command-button command-icon"
          onClick={handleNotificationClick}
          tabIndex={-1}
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
          >
            <NotificationsIcon
              sx={{ fontSize: "1.2rem" }}
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
            backgroundColor: `${ThemeNodetool.palette.grey[900]}E6`,
            boxShadow: "0 16px 64px rgba(0, 0, 0, 0.4)",
            border: `1px solid ${ThemeNodetool.palette.grey[800]}`
          }
        }}
      >
        <Box
          className="notification-container"
          sx={{
            p: 3,
            width: "600px",
            maxHeight: "600px",
            overflow: "auto",
            "&::-webkit-scrollbar": {
              width: "6px"
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: ThemeNodetool.palette.grey[600],
              borderRadius: "3px"
            }
          }}
        >
          {notifications.length === 0 ? (
            <Typography
              className="notification-empty-message"
              color="textSecondary"
              sx={{ fontSize: "0.9rem", fontWeight: 300 }}
            >
              No notifications
            </Typography>
          ) : (
            notifications.map((notification) => (
              <Box
                key={notification.id}
                className={`notification-item notification-type-${notification.type}`}
                sx={{
                  p: 2,
                  mb: 1.5,
                  borderRadius: 1.5,
                  maxHeight: "100px",
                  overflow: "auto",
                  backgroundColor: `${ThemeNodetool.palette.grey[800]}CC`,
                  borderLeft: `3px solid ${
                    notification.type === "error"
                      ? "#f44336"
                      : notification.type === "warning"
                      ? "#ff9800"
                      : notification.type === "success"
                      ? "#4caf50"
                      : notification.type === "info"
                      ? "#2196f3"
                      : ThemeNodetool.palette.grey[600]
                  }`,
                  transition: "all 0.2s ease",
                  position: "relative",
                  "&:hover": {
                    backgroundColor: ThemeNodetool.palette.grey[800]
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
                <CopyToClipboardButton
                  textToCopy={notification.content}
                  className="copy-button"
                  title="Copy to clipboard"
                />
              </Box>
            ))
          )}
        </Box>
      </Popover>
    </div>
  );
});

NotificationButton.displayName = "NotificationButton";

export default NotificationButton;
