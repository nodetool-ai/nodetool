import React, { memo } from "react";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import useWorkflowChatStore from "../../../stores/WorkflowChatStore";
import { ChatHeader } from "./ChatHeader";
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
  const messages = useWorkflowChatStore((state) => state.messages);
  return (
    <ChatHeader
      isMinimized={isMinimized}
      onMinimize={onMinimize}
      onReset={onReset}
      messagesCount={messages.length}
      title="Chat"
      icon={<ChatBubbleOutlineIcon sx={{ fontSize: "1.5em" }} />}
      description="Chat"
    />
  );
};

export default memo(ChatControls, isEqual);
