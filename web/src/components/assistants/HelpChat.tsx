import React, { useCallback } from "react";
import ChatView from "./ChatView";
import { useChatStore } from "../../stores/ChatStore";
import {
  Box,
  List,
  ListItem,
  ListItemText,
  Typography,
  Button
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";

const HelpChat: React.FC = () => {
  const { messages, isLoading, sendMessage, setMessages } = useChatStore();

  const handleSendMessage = useCallback(
    async (prompt: string) => {
      await sendMessage({
        role: "user",
        content: prompt
      });
    },
    [sendMessage]
  );

  const handleResetChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  return (
    <div className="help-chat" style={{ margin: ".5em" }}>
      {messages.length > 0 && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "right",
            mb: 2
          }}
        >
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleResetChat}
            disabled={messages.length === 0}
          >
            Reset Chat
          </Button>
        </Box>
      )}
      {messages.length === 0 && (
        <>
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
              margin: ".5em 0 1em 0"
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
        </>
      )}
      <ChatView
        isLoading={isLoading}
        messages={messages}
        sendMessage={handleSendMessage}
      />
    </div>
  );
};

export default HelpChat;
