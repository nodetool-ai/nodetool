import React, { useCallback, useMemo, memo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Chip,
  Select,
  MenuItem,
  CircularProgress
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { Message } from "../../stores/ApiTypes";
import type { WorkspaceResponse } from "../../stores/ApiTypes";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import { BASE_URL } from "../../stores/BASE_URL";
import { authHeader } from "../../stores/ApiClient";
import ChatView from "../chat/containers/ChatView";
import { useVibecodingTemplates, Template } from "../../hooks/useVibecodingTemplates";

/** Extract the first TypeScript/TSX code block from a markdown AI response. */
function extractCodeBlock(response: string): string | null {
  const match = response.match(
    /```(?:tsx?|typescript|jsx?)?\s*\n([\s\S]*?)```/
  );
  return match ? match[1].trim() : null;
}

interface VibeCodingChatProps {
  workspaceId: string | undefined;
  workspacePath: string | undefined;
  workspaces: WorkspaceResponse[] | undefined;
  isLoadingWorkspaces: boolean;
  onWorkspaceChange: (workspaceId: string) => void;
}

const VibeCodingChat: React.FC<VibeCodingChatProps> = ({
  workspaceId,
  workspacePath,
  workspaces,
  isLoadingWorkspaces,
  onWorkspaceChange
}) => {
  const getSession = useVibeCodingStore((state) => state.getSession);
  const addMessage = useVibeCodingStore((state) => state.addMessage);
  const updateLastMessage = useVibeCodingStore(
    (state) => state.updateLastMessage
  );
  const setChatStatus = useVibeCodingStore((state) => state.setChatStatus);

  const session = workspaceId ? getSession(workspaceId) : null;
  const { templates } = useVibecodingTemplates();
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedResponseRef = useRef<string>("");

  const handleWorkspaceSelect = useCallback(
    (event: SelectChangeEvent<string>) => {
      onWorkspaceChange(event.target.value);
    },
    [onWorkspaceChange]
  );

  const sendMessage = useCallback(
    async (message: Message) => {
      if (!workspaceId) return;
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

      addMessage(workspaceId, {
        type: "message",
        name: "",
        role: "user",
        content: [{ type: "text", text: prompt }],
        created_at: new Date().toISOString()
      });
      addMessage(workspaceId, {
        type: "message",
        name: "",
        role: "assistant",
        content: [{ type: "text", text: "" }],
        created_at: new Date().toISOString()
      });

      setChatStatus(workspaceId, "streaming");
      setIsStreaming(true);
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
            workspace_id: workspaceId,
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
          accumulatedResponseRef.current += decoder.decode(value, {
            stream: true
          });
          updateLastMessage(workspaceId, accumulatedResponseRef.current);
        }

        setChatStatus(workspaceId, "idle");

        const code = extractCodeBlock(accumulatedResponseRef.current);
        if (code && workspacePath && window.api?.workspace?.file) {
          try {
            await window.api.workspace.file.write(
              workspacePath,
              "src/app/page.tsx",
              code
            );
          } catch (writeError) {
            console.error(
              "VibeCoding: failed to write file to workspace:",
              writeError
            );
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          setChatStatus(workspaceId, "idle");
        } else {
          console.error("VibeCoding error:", error);
          setChatStatus(workspaceId, "error");
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [
      workspaceId,
      workspacePath,
      isStreaming,
      addMessage,
      updateLastMessage,
      setChatStatus
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
    if (session?.chatStatus === "error") return "error";
    return "connected";
  }, [isStreaming, session?.chatStatus]);

  const messages = session?.messages ?? [];

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
        <AutoFixHighIcon sx={{ fontSize: 48, mb: 2, opacity: 0.3 }} />
        <Typography variant="h6" gutterBottom>
          {workspaceId ? "Design Your App" : "Select a Workspace"}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 400 }}
        >
          {workspaceId
            ? "Describe your UI. The AI will generate a Next.js page and update the live preview."
            : "Pick a workspace from the dropdown above to start building."}
        </Typography>
      </Box>
    ),
    [workspaceId]
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.paper"
      }}
    >
      {/* Workspace selector header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`
        }}
      >
        <AutoFixHighIcon
          sx={{ fontSize: 20, color: "primary.main", flexShrink: 0 }}
        />
        <Select
          size="small"
          value={workspaceId ?? ""}
          onChange={handleWorkspaceSelect}
          displayEmpty
          disabled={isLoadingWorkspaces}
          fullWidth
          MenuProps={{
            sx: { zIndex: 1500 },
            disablePortal: false
          }}
          sx={{
            fontSize: "0.8125rem",
            "& .MuiSelect-select": { py: 1 }
          }}
        >
          <MenuItem value="" disabled>
            {isLoadingWorkspaces ? "Loading…" : "Select workspace"}
          </MenuItem>
          {workspaces?.map((ws) => (
            <MenuItem key={ws.id} value={ws.id}>
              {ws.name}
            </MenuItem>
          ))}
        </Select>
        {isLoadingWorkspaces && <CircularProgress size={16} />}
      </Box>

      {/* Template chips — shown when workspace selected and no messages */}
      {workspaceId &&
        templates &&
        templates.length > 0 &&
        messages.length === 0 && (
          <Box
            sx={{
              display: "flex",
              gap: 2,
              px: 3,
              py: 2,
              borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
              flexWrap: "wrap"
            }}
          >
            {templates.map((template) => (
              <Chip
                key={template.id}
                label={template.name}
                size="small"
                onClick={createTemplateClickHandler(template)}
                clickable
                variant="outlined"
                sx={{
                  borderColor: "primary.main",
                  color: "primary.main",
                  "&:hover": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText"
                  }
                }}
              />
            ))}
          </Box>
        )}

      {/* Chat area */}
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <ChatView
          status={chatStatus}
          progress={0}
          total={100}
          messages={messages}
          sendMessage={sendMessage}
          onStop={handleStop}
          showToolbar={false}
          noMessagesPlaceholder={welcomePlaceholder}
          progressMessage={null}
        />
      </Box>
    </Box>
  );
};

export default memo(VibeCodingChat);
