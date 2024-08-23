import React, { useCallback, useEffect } from "react";
import ChatView from "./ChatView";
import { MessageCreateRequest } from "../../stores/ApiTypes";
import { useChatStore } from "../../stores/ChatStore";
import { Box, List, ListItem, ListItemText, Typography } from "@mui/material";
import SquareIcon from "@mui/icons-material/CheckBoxOutlineBlank"; // Example icon

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
    <div className="help-chat" style={{ margin: ".5em" }}>
      <Typography variant="h4">Hello</Typography>
      <Typography>
        <Box>
          I&apos;m your experimental AI assistant!
          <br />
          <br />
          Ask me anything about Nodetool&apos;s features, like:
        </Box>
        <Box
          sx={{
            paddingLeft: "1em",
            margin: ".5em 0 1em 0",
            listStyleType: "square",
          }}
        >
          <ul
            style={{
              padding: 0,
              margin: 0,
            }}
          >
            <Typography component="li">Getting started</Typography>
            <Typography component="li">Managing assets</Typography>
            <Typography component="li">Working with nodes</Typography>
            <Typography component="li">Shortcuts</Typography>
            <Typography component="li">Settings</Typography>
          </ul>
        </Box>
        <Box>You can even ask me to try and build a workflow.</Box>
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
