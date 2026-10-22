/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useMemo, useState } from "react";
import { Popover, getSpacingPx, SPACING, EmptyState } from "../ui_primitives";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTheme } from "@mui/material/styles";
import { CopyButton, Text, Caption, CountBadge, ToolbarIconButton, Box, MOTION, BORDER_RADIUS } from "../ui_primitives";
import { useShallow } from "zustand/react/shallow";
import ReportBugButton from "../support/ReportBugButton";
import { useTranslation } from "react-i18next";

const popoverStyles = css({
  paddingRight: "4em",
  marginTop: getSpacingPx(SPACING.xxxl),
  "& .copy-button": {
    position: "absolute",
    opacity: 0.8,
    top: "6px",
    right: "0px"
  }
});

/**
 * Generate an accessible ARIA label for the notification button.
 * Describes the number of unread notifications to screen readers.
 */
const getNotificationButtonLabel = (unreadCount: number, t: (key: string, options?: Record<string, unknown>) => string): string => {
  if (unreadCount === 0) {
    return t("batch2_3.notifications.noneUnread");
  }
  return t("batch2_3.notifications.unread", { count: unreadCount });
};

const NotificationButton: React.FC = React.memo(() => {
  const { t } = useTranslation();
  const [notificationAnchor, setNotificationAnchor] =
    useState<null | HTMLElement>(null);
  const { notifications, lastDisplayedTimestamp, updateLastDisplayedTimestamp } =
    useNotificationStore(
      useShallow((state) => ({
        notifications: state.notifications,
        lastDisplayedTimestamp: state.lastDisplayedTimestamp,
        updateLastDisplayedTimestamp: state.updateLastDisplayedTimestamp
      }))
    );
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
      <CountBadge
        count={unreadCount}
        color="secondary"
        dot
        tooltip={t("batch2_3.notifications.title")}
        ariaLabel={getNotificationButtonLabel(unreadCount, t)}
      >
        <ToolbarIconButton
          className="notification-button command-button command-icon"
          icon={<NotificationsIcon className="notification-icon" />}
          tooltip=""
          onClick={handleNotificationClick}
          ariaLabel={getNotificationButtonLabel(unreadCount, t)}
        />
      </CountBadge>
      <Popover
        css={popoverStyles}
        className="notification-popover"
        open={Boolean(notificationAnchor)}
        anchorEl={notificationAnchor}
        onClose={handleNotificationClose}
        placement="bottom-right"
      >
        <Box
          className="notification-container"
          role="region"
          aria-label={t("batch2_3.notifications.title")}
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
              borderRadius: BORDER_RADIUS.sm
            }
          }}
        >
          {notifications.length === 0 ? (
            <EmptyState
              className="notification-empty-message"
              size="small"
              title={t("batch2_3.notifications.empty")}
            />
          ) : (
            <Box role="list" aria-label={t("batch2_3.notifications.list", { count: notifications.length })}>
              {notifications.map((notification) => (
                <Box
                  key={notification.id}
                  role="listitem"
                  className={`notification-item notification-type-${notification.type}`}
                  aria-label={`${notification.type} notification: ${notification.content}`}
                  sx={{
                    p: 2,
                    mb: 1.5,
                    borderRadius: BORDER_RADIUS.md,
                    maxHeight: "100px",
                    overflow: "auto",
                    backgroundColor: theme.vars.palette.background.paper,
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
                    transition: MOTION.all,
                    position: "relative",
                    "&:hover": {
                      backgroundColor: theme.vars.palette.action.hover
                    }
                  }}
                >
                <Text
                  size="small"
                  className="notification-content"
                  sx={{
                    lineHeight: 1.5,
                    wordWrap: "break-word",
                    pr: 3
                  }}
                >
                  {notification.content}
                </Text>
                  <Caption
                    className="notification-timestamp"
                    sx={{
                      display: "block",
                      mt: 0.5
                    }}
                  >
                    {notification.timestamp.toLocaleString()}
                  </Caption>
                  <CopyButton
                    value={notification.content}
                    className="copy-button"
                    tooltip={t("batch2_3.notifications.copy")}
                  />
                  {notification.type === "error" ? (
                    <ReportBugButton
                      context={{
                        source: "notification",
                        summary: notification.content,
                        errorText: notification.content
                      }}
                    />
                  ) : null}
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
