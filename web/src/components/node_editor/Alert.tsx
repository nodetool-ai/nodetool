/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useState, useRef, createRef, memo, useCallback } from "react";
import type { AlertColor } from "@mui/material";
import { AlertBanner, EditorButton, SPACING, getSpacingPx } from "../ui_primitives";
import { TransitionGroup, CSSTransition } from "react-transition-group";

import {
  useNotificationStore,
  Notification
} from "../../stores/NotificationStore";
import { CopyButton } from "../ui_primitives";
import { NOTIFICATION_TIMEOUT_DEFAULT } from "../../config/constants";

const TRANSITION_DURATION = 300;
const ENTER_OFFSET_Y = 12;

const easing = {
  entering: "cubic-bezier(0, 0, 0.2, 1)",
  exiting: "cubic-bezier(0.4, 0, 1, 1)"
};
const MAX_WIDTH = "440px";
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

const styles = () =>
  css({
    position: "fixed",
    top: "68px",
    right: "calc(2em + 24px)",
    zIndex: "var(--zIndex-popover)",
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.micro),
    alignItems: "flex-end",
    ".MuiAlert-root": {
      minHeight: "unset",
      paddingTop: getSpacingPx(SPACING.sm),
      paddingBottom: getSpacingPx(SPACING.sm),
      paddingLeft: getSpacingPx(SPACING.lg),
      paddingRight: getSpacingPx(SPACING.md),
      alignItems: "flex-start",
      "& .MuiAlert-icon": {
        marginRight: getSpacingPx(SPACING.md),
        paddingTop: getSpacingPx(SPACING.micro),
        opacity: 0.92,
        "& svg": {
          fontSize: "var(--fontSizeBig)"
        }
      },
      "& .MuiAlert-action": {
        paddingTop: 0,
        marginRight: `-${getSpacingPx(SPACING.xs)}`,
        alignItems: "flex-start",
        "& .MuiIconButton-root": {
          padding: getSpacingPx(SPACING.xs)
        }
      }
    },
    ".MuiAlert-message": {
      padding: "0.2em 1.5em 0.1em 0",
      lineHeight: 1.35,
      fontSize: "var(--fontSizeSmall)",
      overflowX: "hidden",
      overflowY: "auto",
      maxHeight: "240px",
      wordWrap: "break-word",
      overflowWrap: "break-word",
      whiteSpace: "pre-wrap"
    },
    ".MuiIconButton-root svg": {
      color: "var(--palette-grey-100)"
    },
    ".copy-button": {
      position: "absolute",
      opacity: 0.8,
      top: "9px",
      right: "26px"
    },
    ".copy-button.has-action": {
      right: "108px"
    },
    li: {
      listStyleType: "none",
      maxWidth: MAX_WIDTH,
      "&.alert-enter": {
        opacity: 0,
        transform: `translateY(${ENTER_OFFSET_Y}px)`
      },
      "&.alert-enter-active": {
        opacity: 1,
        transform: "translateY(0)",
        transition: `opacity ${TRANSITION_DURATION}ms ${easing.entering}, transform ${TRANSITION_DURATION}ms ${easing.entering}`
      },
      "&.alert-exit": {
        opacity: 1,
        transform: "translateY(0)"
      },
      "&.alert-exit-active": {
        opacity: 0,
        transform: `translateY(${ENTER_OFFSET_Y}px)`,
        transition: `opacity ${TRANSITION_DURATION}ms ${easing.exiting}, transform ${TRANSITION_DURATION}ms ${easing.exiting}`
      }
    }
  });


interface NotificationItemProps {
  notification: Notification;
  nodeRef: React.RefObject<HTMLLIElement | null>;
  onClose: (id: string) => void;
  in?: boolean;
  onExited?: () => void;
}

const NotificationItem = memo(function NotificationItem({
  notification,
  nodeRef,
  onClose,
  in: inProp,
  onExited
}: NotificationItemProps) {
  const handleClose = useCallback(() => {
    onClose(notification.id);
  }, [notification.id, onClose]);

  const handleActionClick = useCallback(async () => {
    await notification.action?.onClick();
    onClose(notification.id);
  }, [notification.action, notification.id, onClose]);

  return (
    <CSSTransition
      key={notification.id}
      in={inProp}
      nodeRef={nodeRef}
      timeout={300}
      classNames="alert"
      onExited={onExited}
    >
      <li ref={nodeRef} style={{ position: "relative" }}>
        <AlertBanner
          severity={mapTypeToSeverity(notification.type)}
          onClose={handleClose}
          action={
            notification.action ? (
              <EditorButton
                color="inherit"
                size="small"
                onClick={handleActionClick}
              >
                {notification.action.label}
              </EditorButton>
            ) : undefined
          }
        >
          {notification.content}
        </AlertBanner>
        {(notification.dismissable || notification.type === "error") && (
          <CopyButton
            value={notification.content}
            className={`copy-button ${notification.action ? "has-action" : ""}`}
            tooltip="Copy to clipboard"
          />
        )}
      </li>
    </CSSTransition>
  );
});

NotificationItem.displayName = "NotificationItem";

const Alert: React.FC = memo(() => {
  // Use separate selectors to avoid re-rendering when unrelated store values change
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const lastDisplayedTimestamp = useNotificationStore((state) => state.lastDisplayedTimestamp);
  const updateLastDisplayedTimestamp = useNotificationStore((state) => state.updateLastDisplayedTimestamp);

  const [visibleNotifications, setVisibleNotifications] = useState<
    Notification[]
  >([]);

  const nodeRefs = useRef<Record<string, React.RefObject<HTMLLIElement>>>({});
  const [_show, setShow] = useState<Record<string, boolean>>({});
  // Store timeout IDs in a ref so they persist across effect re-runs
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());
  // Track the timeout created in handleClose to prevent memory leaks
  const handleCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    const timeoutsMap = timeoutsRef.current;
    return () => {
      timeoutsMap.forEach((timeouts) => {
        timeouts.forEach(clearTimeout);
      });
      timeoutsMap.clear();
      if (handleCloseTimeoutRef.current) {
        clearTimeout(handleCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Clean up visible notifications that were removed from the store (e.g. via replaceExisting)
    const storeIds = new Set(notifications.map((n) => n.id));
    setVisibleNotifications((prev) => {
      const filtered = prev.filter((n) => storeIds.has(n.id));
      if (filtered.length === prev.length) {
        return prev;
      }
      // Clear timeouts for removed notifications
      prev.forEach((n) => {
        if (!storeIds.has(n.id)) {
          const timeouts = timeoutsRef.current.get(n.id);
          if (timeouts) {
            timeouts.forEach(clearTimeout);
            timeoutsRef.current.delete(n.id);
          }
        }
      });
      return filtered;
    });

    const lastDisplayedDate = new Date(lastDisplayedTimestamp || 0);
    const newNotifications = notifications.filter(
      (notification) =>
        notification.alert &&
        new Date(notification.timestamp) > lastDisplayedDate
    );

    if (newNotifications.length === 0) {
      return;
    }

    setVisibleNotifications((prevNotifications) => {
      const combined = [...prevNotifications, ...newNotifications];
      // Deduplicate by id, preserving first-seen order.
      const seenIds = new Set<string>();
      const result: Notification[] = [];
      for (const notification of combined) {
        if (!seenIds.has(notification.id)) {
          seenIds.add(notification.id);
          result.push(notification);
        }
      }
      return result;
    });

    const latestTimestamp = newNotifications.reduce(
      (max, { timestamp }) =>
        new Date(timestamp) > max ? new Date(timestamp) : max,
      lastDisplayedDate
    );

    if (latestTimestamp > lastDisplayedDate) {
      updateLastDisplayedTimestamp(latestTimestamp);
    }

    newNotifications.forEach((notification) => {
      setShow((s) => ({ ...s, [notification.id]: true }));

      const showTimeout = setTimeout(() => {
        setShow((s) => ({ ...s, [notification.id]: false }));

        const removeTimeout = setTimeout(() => {
          setVisibleNotifications((prev) =>
            prev.filter((item) => item.id !== notification.id)
          );
          // Clean up tracked timeouts for this notification
          timeoutsRef.current.delete(notification.id);
        }, TRANSITION_DURATION);

        const existing = timeoutsRef.current.get(notification.id) || [];
        existing.push(removeTimeout);
        timeoutsRef.current.set(notification.id, existing);
      }, notification.timeout || NOTIFICATION_TIMEOUT_DEFAULT);

      const existing = timeoutsRef.current.get(notification.id) || [];
      existing.push(showTimeout);
      timeoutsRef.current.set(notification.id, existing);
    });
  }, [
    notifications,
    lastDisplayedTimestamp,
    updateLastDisplayedTimestamp
  ]);

  const handleClose = useCallback((id: string) => {
    setShow((s) => ({ ...s, [id]: false }));
    // Clear any existing timeout to prevent memory leaks
    if (handleCloseTimeoutRef.current) {
      clearTimeout(handleCloseTimeoutRef.current);
    }
    handleCloseTimeoutRef.current = setTimeout(() => {
      removeNotification(id);
      setVisibleNotifications((prev) =>
        prev.filter((notification) => notification.id !== id)
      );
    }, TRANSITION_DURATION);
  }, [removeNotification]);

  return (
    <TransitionGroup component="ul" css={styles()} className="alert-list">
      {visibleNotifications.map((notification: Notification) => {
        if (!nodeRefs.current[notification.id]) {
          nodeRefs.current[notification.id] = createRef<HTMLLIElement>() as React.RefObject<HTMLLIElement>;
        }
        const nodeRef = nodeRefs.current[notification.id];

        return (
          <NotificationItem
            key={notification.id}
            notification={notification}
            nodeRef={nodeRef}
            onClose={handleClose}
          />
        );
      })}
    </TransitionGroup>
  );
});

Alert.displayName = "Alert";

export default Alert;
