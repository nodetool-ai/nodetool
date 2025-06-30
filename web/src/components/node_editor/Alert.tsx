/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useEffect, useState, useRef, createRef } from "react";
import { Alert as MUIAlert, AlertColor, IconButton } from "@mui/material";
import { TransitionGroup, CSSTransition } from "react-transition-group";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import {
  useNotificationStore,
  Notification
} from "../../stores/NotificationStore";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { CopyToClipboardButton } from "../common/CopyToClipboardButton";

const TRANSITION_DURATION = 300; // Duration for fade in/out animations
const DEFAULT_NOTIFICATION_TIMEOUT = 3000; // Default time before notification auto-closes
const MAX_WIDTH = "500px";
const mapTypeToSeverity = (type: Notification["type"]): AlertColor => {
  const typeMap: Record<string, AlertColor> = {
    error: "error",
    warning: "warning",
    info: "info",
    success: "success",
    progress: "info",
    debug: "info",
    node: "info",
    job: "info"
  };

  return typeMap[type] || "info";
};

const styles = css({
  position: "fixed",
  top: "60px",
  right: "2em",
  zIndex: 10000,
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  alignItems: "flex-end",
  ".MuiAlert-message": {
    padding: "0.5em 2em 0.2em 0",
    lineHeight: "1.2em",
    fontSize: "var(--fontSizeBig)",
    overflowX: "hidden",
    overflowY: "auto",
    maxHeight: "80px"
  },
  ".MuiIconButton-root svg": {
    color: "var(--palette.grey[800])"
  },
  ".copy-button": {
    position: "absolute",
    opacity: 0.8,
    top: "13px",
    right: "30px"
  },
  li: {
    listStyleType: "none",
    maxWidth: MAX_WIDTH,
    transition: "all 0.3s ease-in-out",
    "&.alert-enter": {
      opacity: 0,
      transform: "translateX(100%)"
    },
    "&.alert-enter-active": {
      opacity: 1,
      transform: "translateX(0)"
    },
    "&.alert-exit": {
      opacity: 1,
      transform: "translateX(0)"
    },
    "&.alert-exit-active": {
      opacity: 0,
      transform: "translateX(100%)"
    }
  }
});

const Alert: React.FC = () => {
  const {
    notifications,
    removeNotification,
    lastDisplayedTimestamp,
    updateLastDisplayedTimestamp
  } = useNotificationStore((state) => ({
    notifications: state.notifications,
    removeNotification: state.removeNotification,
    lastDisplayedTimestamp: state.lastDisplayedTimestamp,
    updateLastDisplayedTimestamp: state.updateLastDisplayedTimestamp
  }));
  const { writeClipboard } = useClipboard();

  const [visibleNotifications, setVisibleNotifications] = useState<
    Notification[]
  >([]);

  const nodeRefs = useRef<Record<string, React.RefObject<HTMLLIElement>>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const lastDisplayedDate = new Date(lastDisplayedTimestamp || 0);
    const newNotifications = notifications.filter(
      (notification) =>
        notification.alert &&
        new Date(notification.timestamp) > lastDisplayedDate
    );

    if (newNotifications.length > 0) {
      setVisibleNotifications((prevNotifications) => {
        const combined = [...prevNotifications, ...newNotifications];
        // Deduplicate notifications by id
        return combined.reduce((acc, current) => {
          if (acc.findIndex(({ id }) => id === current.id) === -1) {
            acc.push(current);
          }
          return acc;
        }, [] as Notification[]);
      });

      const latestTimestamp = newNotifications.reduce(
        (max, { timestamp }) =>
          new Date(timestamp) > max ? new Date(timestamp) : max,
        lastDisplayedDate
      );

      if (latestTimestamp > lastDisplayedDate) {
        updateLastDisplayedTimestamp(latestTimestamp);
      }
    }

    newNotifications.forEach((notification) => {
      setShow((s) => ({ ...s, [notification.id]: true }));
      setTimeout(() => {
        setShow((s) => ({ ...s, [notification.id]: false }));

        setTimeout(() => {
          setVisibleNotifications((prev) =>
            prev.filter((item) => item.id !== notification.id)
          );
        }, TRANSITION_DURATION);
      }, notification.timeout || DEFAULT_NOTIFICATION_TIMEOUT);
    });

    const timeouts = newNotifications.map((notification) => {
      const showTimeout = setTimeout(() => {
        setShow((s) => ({ ...s, [notification.id]: false }));
        const removeTimeout = setTimeout(() => {
          setVisibleNotifications((prev) =>
            prev.filter((item) => item.id !== notification.id)
          );
        }, TRANSITION_DURATION);
        return removeTimeout;
      }, notification.timeout || DEFAULT_NOTIFICATION_TIMEOUT);
      return showTimeout;
    });

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [
    notifications,
    lastDisplayedTimestamp,
    removeNotification,
    updateLastDisplayedTimestamp
  ]);

  const handleClose = (id: string) => {
    setShow((s) => ({ ...s, [id]: false }));
    setTimeout(() => {
      removeNotification(id);
      setVisibleNotifications((prev) =>
        prev.filter((notification) => notification.id !== id)
      );
    }, TRANSITION_DURATION);
  };

  const initiateExitTransition = (id: string) => {
    setShow((s) => ({ ...s, [id]: false }));
    setTimeout(() => {
      removeNotification(id);
      setVisibleNotifications((prev) =>
        prev.filter((notification) => notification.id !== id)
      );
    }, TRANSITION_DURATION);
  };

  const handleCopy = async (content: string) => {
    await writeClipboard(content, true);
  };

  return (
    <TransitionGroup component="ul" css={styles} className="alert-list">
      {visibleNotifications.map((notification: Notification) => {
        if (!nodeRefs.current[notification.id]) {
          nodeRefs.current[notification.id] = createRef<HTMLLIElement>();
        }
        const nodeRef = nodeRefs.current[notification.id];

        return (
          <CSSTransition
            key={notification.id}
            nodeRef={nodeRef}
            timeout={300}
            classNames="alert"
            onExited={() => {
              delete nodeRefs.current[notification.id];
            }}
          >
            <li ref={nodeRef} style={{ position: "relative" }}>
              <MUIAlert
                severity={mapTypeToSeverity(notification.type)}
                onClose={
                  notification.type === "error" || notification.dismissable
                    ? () => handleClose(notification.id)
                    : undefined
                }
              >
                {notification.content}
              </MUIAlert>
              {(notification.dismissable || notification.type === "error") && (
                <CopyToClipboardButton
                  textToCopy={notification.content}
                  className="copy-button"
                  title="Copy to clipboard"
                />
              )}
            </li>
          </CSSTransition>
        );
      })}
    </TransitionGroup>
  );
};
export default Alert;
