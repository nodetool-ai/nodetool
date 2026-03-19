/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, memo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, Chip } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { Message, Workflow } from "../../stores/ApiTypes";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import { BASE_URL } from "../../stores/BASE_URL";
import { authHeader } from "../../stores/ApiClient";
import ChatView from "../chat/containers/ChatView";
import type { Theme } from "@mui/material/styles";
import { useVibecodingTemplates, Template } from "../../hooks/useVibecodingTemplates";
import log from "loglevel";

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

/** Extract the first TypeScript/TSX code block from a markdown AI response. */
function extractCodeBlock(response: string): string | null {
  const match = response.match(/```(?:tsx?|typescript|jsx?)?\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

interface VibeCodingChatProps {
  workflow: Workflow;
  workspacePath: string;
}

const VibeCodingChat: React.FC<VibeCodingChatProps> = ({
  workflow,
  workspacePath
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const getSession = useVibeCodingStore((state) => state.getSession);
  const addMessage = useVibeCodingStore((state) => state.addMessage);
  const updateLastMessage = useVibeCodingStore((state) => state.updateLastMessage);
  const setStatus = useVibeCodingStore((state) => state.setStatus);
  const setError = useVibeCodingStore((state) => state.setError);

  const session = getSession(workflow.id);
  const { templates } = useVibecodingTemplates();
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedResponseRef = useRef<string>("");

  const sendMessage = useCallback(
    async (message: Message) => {
      let prompt = "";
      if (Array.isArray(message.content)) {
        const textContent = message.content.find(
          (c): c is { type: "text"; text: string } => c.type === "text"
        );
        prompt = textContent?.text ?? "";
      } else if (typeof message.content === "string") {
        prompt = message.content;
      }
      if (!prompt.trim() || isStreaming) return;

      addMessage(workflow.id, {
        type: "message",
        name: "",
        role: "user",
        content: [{ type: "text", text: prompt }],
        created_at: new Date().toISOString()
      });
      addMessage(workflow.id, {
        type: "message",
        name: "",
        role: "assistant",
        content: [{ type: "text", text: "" }],
        created_at: new Date().toISOString()
      });

      setStatus(workflow.id, "streaming");
      setIsStreaming(true);
      setError(workflow.id, null);
      accumulatedResponseRef.current = "";
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
            prompt
          }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulatedResponseRef.current += decoder.decode(value, { stream: true });
          updateLastMessage(workflow.id, accumulatedResponseRef.current);
        }

        // Write generated TSX page to workspace
        const code = extractCodeBlock(accumulatedResponseRef.current);
        if (code && workspacePath && window.api?.workspace?.file) {
          await window.api.workspace.file.write(workspacePath, "src/app/page.tsx", code);
        }

        setStatus(workflow.id, "complete");
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          setStatus(workflow.id, "idle");
        } else {
          log.error("VibeCoding error:", error);
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
      workspacePath,
      isStreaming,
      addMessage,
      updateLastMessage,
      setStatus,
      setError
    ]
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleTemplateClick = useCallback(
    (template: Template) => {
      sendMessage({
        type: "message",
        name: "",
        role: "user",
        content: [{ type: "text", text: template.prompt }],
        created_at: new Date().toISOString()
      });
    },
    [sendMessage]
  );

  const createTemplateClickHandler = useCallback(
    (template: Template) => () => handleTemplateClick(template),
    [handleTemplateClick]
  );

  const chatStatus = useMemo(() => {
    if (isStreaming) return "streaming";
    return session.status === "error" ? "error" : "connected";
  }, [isStreaming, session.status]);

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
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
          Describe your UI. The AI will generate a Next.js page and update the
          live preview.
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

      {templates && templates.length > 0 && session.messages.length === 0 && (
        <div className="template-chips">
          {templates.map((template) => (
            <Chip
              key={template.id}
              label={template.name}
              size="small"
              onClick={createTemplateClickHandler(template)}
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

export default memo(VibeCodingChat);
