import React, { memo } from "react";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { ChatHeader } from "../containers/ChatHeader";
import { isEqual } from "lodash";

interface ChatControlsProps {
  onMinimize: () => void;
  onReset: () => void;
  isMinimized: boolean;
}

const ChatControls: React.FC<ChatControlsProps> = ({
  onMinimize,
  onReset,
  isMinimized
}) => {
  return (
    <ChatHeader
      isMinimized={isMinimized}
      onMinimize={onMinimize}
      onReset={onReset}
      title="Chat"
      icon={<ChatBubbleOutlineIcon sx={{ fontSize: "1.5em" }} />}
    />
  );
};

export default memo(ChatControls, isEqual);
