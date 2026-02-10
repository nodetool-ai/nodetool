import React from "react";
import { ResetButton } from "../controls/ResetButton";
import { MinimizeButton } from "../controls/MinimizeButton";
import { FlexRow, Text } from "../../ui_primitives";

interface ChatHeaderProps {
  isMinimized: boolean;
  onMinimize?: () => void;
  onReset?: () => void;
  messagesCount?: number;
  title?: string;
  icon?: React.ReactNode;
  description?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isMinimized,
  onMinimize,
  onReset,
  messagesCount,
  title,
  icon,
  description
}) => (
  <FlexRow
    className="chat-header"
    justify="space-between"
    align="center"
    sx={{
      cursor: "grab",
      mb: isMinimized ? 0 : 2,
      position: "sticky",
      top: 0,
      zIndex: 1,
      p: 0,
      height: "28px",
      borderRadius: isMinimized ? "20px" : "12px 12px 0 0"
    }}
  >
    {!isMinimized && onReset && (
      <ResetButton onClick={onReset} disabled={messagesCount === 0} />
    )}
    {isMinimized && title && (
      <FlexRow
        gap={3}
        align="center"
        onClick={onMinimize}
        sx={{
          padding: "1.5em 1em 0 1.5em",
          textAlign: "center",
          width: "100%",
          cursor: "pointer",
          userSelect: "none",
          color: "text.secondary",
          "&:hover": {
            color: "palette-grey-100"
          }
        }}
      >
        {icon}
        <Text size="small" color="secondary">{title}</Text>
      </FlexRow>
    )}
    {description && !isMinimized && (
      <Text
        size="small"
        color="secondary"
        sx={{
          flexGrow: 1,
          userSelect: "none",
          textAlign: "center",
          textTransform: "uppercase",
          fontWeight: "light"
        }}
      >
        {description}
      </Text>
    )}
    {onMinimize && (
      <MinimizeButton onClick={onMinimize} isMinimized={isMinimized} />
    )}
  </FlexRow>
);
