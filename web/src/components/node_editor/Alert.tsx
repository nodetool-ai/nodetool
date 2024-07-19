/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useEffect, useState } from "react";
import { Alert as MUIAlert, AlertColor } from "@mui/material";
import { TransitionGroup, CSSTransition } from "react-transition-group";

import {
  useNotificationStore,
  Notification
} from "../../stores/NotificationStore";

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
  bottom: "0px",
  right: "2em",
  zIndex: 100000,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  li: {
    listStyleType: "none",
    maxWidth: "35vw"
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

  const [visibleNotifications, setVisibleNotifications] = useState<
    Notification[]
  >([]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          // removeNotification(notification.id);
          setVisibleNotifications((prev) =>
            prev.filter((item) => item.id !== notification.id)
          );
        }, 500);
      }, notification.timeout || 3000);
    });

    const timeouts = newNotifications.map((notification) => {
      const showTimeout = setTimeout(() => {
        setShow((s) => ({ ...s, [notification.id]: false }));
        const removeTimeout = setTimeout(() => {
          // removeNotification(notification.id);
          setVisibleNotifications((prev) =>
            prev.filter((item) => item.id !== notification.id)
          );
        }, 500); // Fade out duration
        return removeTimeout;
      }, notification.timeout || 3000);
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

  const initiateExitTransition = (id: string) => {
    setShow((s) => ({ ...s, [id]: false }));

    setTimeout(() => {
      // removeNotification(id);
      setVisibleNotifications((prev) =>
        prev.filter((notification) => notification.id !== id)
      );
    }, 500);
  };
  return (
    <ul css={styles}>
      {visibleNotifications.map((notification: Notification) => (
        <li key={notification.id}>
          <MUIAlert
            severity={mapTypeToSeverity(notification.type)}
            onClose={
              notification.dismissable
                ? () => initiateExitTransition(notification.id)
                : undefined
            }
          >
            {notification.content}
          </MUIAlert>
        </li>
      ))}
    </ul>
  );
};
export default Alert;
