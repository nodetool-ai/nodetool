import * as React from "react";
import { NotificationBadge, FlexRow } from "nodetool";
import NotificationsIcon from "@mui/icons-material/Notifications";
import ChatBubbleIcon from "@mui/icons-material/ChatBubble";
import CloudQueueIcon from "@mui/icons-material/CloudQueue";

const iconBox: React.CSSProperties = { color: "#c7c9cc", fontSize: 28 };

export const Counts = () => (
  <FlexRow gap={6} align="center">
    <NotificationBadge count={1}>
      <NotificationsIcon sx={iconBox} />
    </NotificationBadge>
    <NotificationBadge count={12}>
      <ChatBubbleIcon sx={iconBox} />
    </NotificationBadge>
    <NotificationBadge count={150} max={99}>
      <CloudQueueIcon sx={iconBox} />
    </NotificationBadge>
  </FlexRow>
);

export const Colors = () => (
  <FlexRow gap={6} align="center">
    <NotificationBadge count={3} color="error">
      <NotificationsIcon sx={iconBox} />
    </NotificationBadge>
    <NotificationBadge count={3} color="primary">
      <NotificationsIcon sx={iconBox} />
    </NotificationBadge>
    <NotificationBadge count={3} color="success">
      <NotificationsIcon sx={iconBox} />
    </NotificationBadge>
    <NotificationBadge count={3} color="warning">
      <NotificationsIcon sx={iconBox} />
    </NotificationBadge>
  </FlexRow>
);

export const Dot = () => (
  <FlexRow gap={6} align="center">
    <NotificationBadge count={1} dot>
      <NotificationsIcon sx={iconBox} />
    </NotificationBadge>
    <NotificationBadge count={1} dot color="success">
      <CloudQueueIcon sx={iconBox} />
    </NotificationBadge>
  </FlexRow>
);
