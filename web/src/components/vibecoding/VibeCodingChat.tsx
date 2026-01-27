/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, Chip } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { Message, Workflow } from "../../stores/ApiTypes";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import { extractHtmlFromResponse } from "./utils/extractHtml";
import { BASE_URL } from "../../stores/BASE_URL";
import { authHeader } from "../../stores/ApiClient";
import ChatView from "../chat/containers/ChatView";
import type { Theme } from "@mui/material/styles";

const createStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: theme.palette.background.paper
    },
    ".chat-header": {
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.palette.divider}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    ".chat-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".template-chips": {
      display: "flex",
      gap: "8px",
      padding: "8px 16px",
      borderBottom: `1px solid ${theme.palette.divider}`,
      flexWrap: "wrap"
    },
    ".chat-container": {
      flex: 1,
      overflow: "hidden"
    }
  });

interface Template {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

interface VibeCodingChatProps {
  workflow: Workflow;
  onHtmlGenerated: (html: string) => void;
}

const VibeCodingChat: React.FC<VibeCodingChatProps> = ({
  workflow,
  onHtmlGenerated
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    getSession,
    addMessage,
    updateLastMessage,
    setStatus,
    setError,
    setCurrentHtml
  } = useVibeCodingStore();

  const session = getSession(workflow.id);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedResponseRef = useRef<string>("");

  // Load templates on mount
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const headers = await authHeader();
        const response = await fetch(`${BASE_URL}/api/vibecoding/templates`, {
          headers
        });
        if (response.ok) {
          const data = await response.json();
          setTemplates(data as Template[]);
        }
      } catch (error) {
        // Templates are optional, just log error
        console.error("Failed to load templates:", error);
      }
    };
    loadTemplates();
  }, []);

  // Send message to VibeCoding agent
  const sendMessage = useCallback(
    async (message: Message) => {
      let prompt = "";
      if (Array.isArray(message.content)) {
        const textContent = message.content.find(
          (c): c is { type: "text"; text: string } => c.type === "text"
        );
        prompt = textContent?.text || "";
      } else if (typeof message.content === "string") {
        prompt = message.content;
      }
      if (!prompt.trim() || isStreaming) {
        return;
      }

      // Add user message
      const userMessage: Message = {
        type: "message",
        name: "",
        role: "user",
        content: [{ type: "text", text: prompt }],
        created_at: new Date().toISOString()
      };
      addMessage(workflow.id, userMessage);

      // Add placeholder assistant message
      const assistantMessage: Message = {
        type: "message",
        name: "",
        role: "assistant",
        content: [{ type: "text", text: "" }],
        created_at: new Date().toISOString()
      };
      addMessage(workflow.id, assistantMessage);

      setStatus(workflow.id, "streaming");
      setIsStreaming(true);
      setError(workflow.id, null);
      accumulatedResponseRef.current = "";

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      try {
        const headers = await authHeader();
        const response = await fetch(`${BASE_URL}/api/vibecoding/generate`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            workflow_id: workflow.id,
            prompt: prompt
          }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          accumulatedResponseRef.current += chunk;

          // Update the last message with accumulated content
          updateLastMessage(workflow.id, accumulatedResponseRef.current);

          // Try to extract HTML from the accumulated response
          const extractedHtml = extractHtmlFromResponse(
            accumulatedResponseRef.current
          );
          if (extractedHtml) {
            setCurrentHtml(workflow.id, extractedHtml);
            onHtmlGenerated(extractedHtml);
          }
        }

        setStatus(workflow.id, "complete");
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          setStatus(workflow.id, "idle");
        } else {
          console.error("VibeCoding error:", error);
          const errorMessage =
            error instanceof Error ? error.message : "Failed to generate";
          setError(workflow.id, errorMessage);
          setStatus(workflow.id, "error");
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [
      workflow.id,
      isStreaming,
      addMessage,
      updateLastMessage,
      setStatus,
      setError,
      setCurrentHtml,
      onHtmlGenerated
    ]
  );

  // Stop generation
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Handle template click
  const handleTemplateClick = useCallback(
    (template: Template) => {
      const message: Message = {
        type: "message",
        name: "",
        role: "user",
        content: [{ type: "text", text: template.prompt }],
        created_at: new Date().toISOString()
      };
      sendMessage(message);
    },
    [sendMessage]
  );

  // Map session status to ChatView status
  const chatStatus = useMemo(() => {
    if (isStreaming) {
      return "streaming";
    }
    if (session.status === "error") {
      return "error";
    }
    return "connected";
  }, [isStreaming, session.status]);

  // Build welcome placeholder
  const welcomePlaceholder = useMemo(
    () => (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          textAlign: "center",
          p: 4
        }}
      >
        <AutoFixHighIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography variant="h6" gutterBottom>
          Design Your App
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 400 }}
        >
          Describe how you want your workflow&apos;s UI to look. Try something
          like: &quot;Create a modern dark-themed interface with a gradient
          background&quot;
        </Typography>
      </Box>
    ),
    []
  );

  return (
    <Box css={styles}>
      <div className="chat-header">
        <div className="chat-title">
          <AutoFixHighIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={500}>
            VibeCoding
          </Typography>
        </div>
        <Typography variant="caption" color="text.secondary">
          {workflow.name}
        </Typography>
      </div>

      {templates.length > 0 && session.messages.length === 0 && (
        <div className="template-chips">
          {templates.map((template) => (
            <Chip
              key={template.id}
              label={template.name}
              size="small"
              onClick={() => handleTemplateClick(template)}
              clickable
              variant="outlined"
            />
          ))}
        </div>
      )}

      <div className="chat-container">
        <ChatView
          status={chatStatus}
          progress={0}
          total={100}
          messages={session.messages}
          sendMessage={sendMessage}
          onStop={handleStop}
          showToolbar={false}
          noMessagesPlaceholder={welcomePlaceholder}
          progressMessage={null}
        />
      </div>
    </Box>
  );
};

export default VibeCodingChat;
