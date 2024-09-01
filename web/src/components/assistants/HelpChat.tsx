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
      <Box sx={{ mb: 2 }}>
        <Typography>I&apos;m your experimental AI assistant!</Typography>
        <Typography sx={{ mt: 2 }}>
          Ask me anything about Nodetool&apos;s features, like:
        </Typography>
      </Box>
      <Box
        sx={{
          paddingLeft: "1em",
          margin: ".5em 0 1em 0",
        }}
      >
        <List sx={{ listStyleType: "square", pl: 2 }}>
          <ListItem sx={{ display: "list-item", p: 0 }}>
            <ListItemText primary="Getting started" />
          </ListItem>
          <ListItem sx={{ display: "list-item", p: 0 }}>
            <ListItemText primary="Managing assets" />
          </ListItem>
          <ListItem sx={{ display: "list-item", p: 0 }}>
            <ListItemText primary="Working with nodes" />
          </ListItem>
          <ListItem sx={{ display: "list-item", p: 0 }}>
            <ListItemText primary="Shortcuts" />
          </ListItem>
          <ListItem sx={{ display: "list-item", p: 0 }}>
            <ListItemText primary="Settings" />
          </ListItem>
        </List>
      </Box>
      <Typography sx={{ mb: 2 }}>
        You can even ask me to try and build a workflow.
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
