import React, { useCallback, useEffect } from "react";
import ChatView from "./ChatView";
import { MessageCreateRequest } from "../../stores/ApiTypes";
import { useChatStore } from "../../stores/ChatStore";
import { Typography } from "@mui/material";

const HelpChat: React.FC = () => {
  const { threadId, messages, isLoading, fetchMessages, sendMessage } =
    useChatStore();

  useEffect(() => {
    fetchMessages(threadId);
  }, [threadId, fetchMessages]);

  const handleSendMessage = useCallback(
    async (prompt: string) => {
      const messageRequest: MessageCreateRequest = {
        thread_id: threadId,
        role: "user",
        content: prompt,
      };
      await sendMessage(messageRequest);
    },
    [threadId, sendMessage]
  );

  return (
    <div className="help-chat">
      <Typography style={{ margin: "1em" }}>
        <h3>Welcome to Nodetool!</h3>
        I&apos;m your AI assistant, ready to help you create AI workflows.
        <br />
        <br />
        Ask me anything about Nodetool&apos;s features, from building workflows
        to managing assets.
        <br />
        <br />
        Let&apos;s bring your AI ideas to life!
      </Typography>
      <ChatView
        isLoading={isLoading}
        messages={messages}
        sendMessage={handleSendMessage}
      />
    </div>
  );
};

export default HelpChat;
