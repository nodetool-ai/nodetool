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
import ThemeNodetool from "../themes/ThemeNodetool";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const NotificationButton: React.FC = React.memo(() => {
  const [notificationAnchor, setNotificationAnchor] =
    useState<null | HTMLElement>(null);
  const {
    notifications,
    lastDisplayedTimestamp,
    updateLastDisplayedTimestamp
  } = useNotificationStore();

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

  return (
    <>
      <Tooltip title="Notifications" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className="command-button"
          onClick={handleNotificationClick}
          tabIndex={-1}
          sx={{
            "& .MuiBadge-badge": {
              fontSize: "0.7rem",
              minWidth: "16px",
              height: "16px",
              padding: "0 4px"
            }
          }}
        >
          <Badge badgeContent={unreadCount} color="error">
            <NotificationsIcon sx={{ fontSize: "1.2rem" }} />
          </Badge>
        </Button>
      </Tooltip>
      <Popover
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
            backgroundColor: `${ThemeNodetool.palette.c_gray0}E6`,
            boxShadow: "0 16px 64px rgba(0, 0, 0, 0.4)",
            border: `1px solid ${ThemeNodetool.palette.c_gray1}`
          }
        }}
      >
        <Box
          sx={{
            p: 3,
            width: "600px",
            maxHeight: "600px",
            overflow: "auto",
            "&::-webkit-scrollbar": {
              width: "6px"
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: ThemeNodetool.palette.c_gray2,
              borderRadius: "3px"
            }
          }}
        >
          {notifications.length === 0 ? (
            <Typography
              color="textSecondary"
              sx={{ fontSize: "0.9rem", fontWeight: 300 }}
            >
              No notifications
            </Typography>
          ) : (
            notifications.map((notification) => (
              <Box
                key={notification.id}
                sx={{
                  p: 2,
                  mb: 1.5,
                  borderRadius: 1.5,
                  backgroundColor: `${ThemeNodetool.palette.c_gray1}CC`,
                  borderLeft: `3px solid ${
                    notification.type === "error"
                      ? "#f44336"
                      : notification.type === "warning"
                      ? "#ff9800"
                      : notification.type === "success"
                      ? "#4caf50"
                      : notification.type === "info"
                      ? "#2196f3"
                      : ThemeNodetool.palette.c_gray2
                  }`,
                  transition: "all 0.2s ease",
                  "&:hover": {
                    backgroundColor: ThemeNodetool.palette.c_gray1,
                    transform: "translateX(2px)"
                  }
                }}
              >
                <Typography
                  variant="body2"
                  color="textPrimary"
                  sx={{ fontSize: "0.85rem", lineHeight: 1.5 }}
                >
                  {notification.content}
                </Typography>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  sx={{
                    fontSize: "0.75rem",
                    display: "block",
                    mt: 0.5
                  }}
                >
                  {notification.timestamp.toLocaleString()}
                </Typography>
              </Box>
            ))
          )}
        </Box>
      </Popover>
    </>
  );
});

NotificationButton.displayName = "NotificationButton";

export default NotificationButton;
