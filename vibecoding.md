# VibeCoding Agent Frontend Implementation

## Prompt for Coding Agent

---

### Objective

Implement the frontend components for the VibeCoding feature in Nodetool. This includes a chat interface for interacting with the VibeCoding agent, a live preview panel for the generated HTML, and integration with the existing MiniApp system to render custom workflow UIs.

---

### Context & Rationale

**Why this feature exists:**
The VibeCoding agent backend is complete and can generate self-contained HTML apps for workflows. The frontend needs to:
1. Provide a chat interface where users describe their desired UI
2. Extract and preview generated HTML in real-time
3. Allow saving the HTML to the workflow's `html_app` field
4. Render saved custom UIs in place of the generic MiniApp interface

**How it fits into the architecture:**
- **Reuse `ChatView`**: The existing chat component handles message display, streaming, and input. We wrap it with VibeCoding-specific logic.
- **Reuse `GlobalWebSocketManager`**: Already handles multiplexed websocket connections with `thread_id` routing.
- **Reuse `useWorkflowManager`**: Handles workflow CRUD operations including saving `html_app`.
- **Extend `MiniAppPage`**: Conditionally render custom HTML when `workflow.html_app` exists.

**Key design decisions:**
1. **Split panel layout**: Chat on left, live preview on right - users see results immediately
2. **Sandboxed iframe**: Generated HTML runs in isolated iframe for security
3. **Dirty state tracking**: Warn users before navigating away with unsaved changes
4. **Graceful fallback**: If custom HTML fails to load/render, fall back to default MiniApp UI

---

### Existing Code Reference

**ChatView Component** (`web/src/components/chat/containers/ChatView.tsx`):
```typescript
type ChatViewProps = {
  status: "disconnected" | "connecting" | "connected" | "loading" | "error" | "streaming" | ...;
  progress: number;
  total: number;
  messages: Array<Message>;
  model?: LanguageModel;
  showToolbar?: boolean;
  sendMessage: (content: MessageContent[], prompt: string, agentMode: boolean) => void;
  onStop?: () => void;
  onNewChat?: () => void;
  // ... more props
};
```

**GlobalWebSocketManager** (`web/src/lib/websocket/GlobalWebSocketManager.ts`):
```typescript
class GlobalWebSocketManager {
  async ensureConnection(): Promise<void>;
  subscribe(key: string, handler: MessageHandler): () => void;
  async send(message: any): Promise<void>;
}
export const globalWebSocketManager = GlobalWebSocketManager.getInstance();
```

**MiniAppPage** (`web/src/components/miniapps/MiniAppPage.tsx`):
```typescript
const MiniAppPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId?: string }>();
  const { data: workflow } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: async () => await fetchWorkflow(workflowId ?? ""),
  });
  // Renders MiniAppInputsForm + MiniAppResults
};
```

**Workflow Type** (`web/src/stores/ApiTypes.ts`):
```typescript
interface Workflow {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, any> | null;
  output_schema: Record<string, any> | null;
  html_app: string | null;  // The custom HTML app
  // ... other fields
}
```

**useWorkflowManager** (`web/src/contexts/WorkflowManagerContext.tsx`):
```typescript
interface WorkflowManagerState {
  fetchWorkflow: (id: string) => Promise<Workflow>;
  updateWorkflow: (id: string, updates: Partial<WorkflowRequest>) => Promise<Workflow>;
  // ... other methods
}
```

**API Client** (`web/src/stores/ApiClient.ts`):
```typescript
import { client } from "./ApiClient";
// Usage: client.GET("/api/..."), client.POST("/api/...", { body: ... })
```

**Base URLs** (`web/src/stores/BASE_URL.ts`):
```typescript
export const API_URL: string;      // e.g., "http://localhost:7777/api"
export const WORKER_URL: string;   // e.g., "ws://localhost:7777/ws"
```

---

### Implementation Tasks

#### Task 1: Create VibeCoding Zustand Store

**File:** `web/src/stores/VibeCodingStore.ts`

This store manages the state for VibeCoding sessions.

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Message } from "./ApiTypes";

export type VibeCodingStatus = 
  | "idle" 
  | "connecting" 
  | "streaming" 
  | "complete" 
  | "error";

interface VibeCodingSession {
  workflowId: string;
  messages: Message[];
  currentHtml: string | null;      // Latest generated HTML (may be unsaved)
  savedHtml: string | null;        // Last saved html_app from workflow
  status: VibeCodingStatus;
  error: string | null;
}

interface VibeCodingState {
  sessions: Record<string, VibeCodingSession>;
  
  // Session management
  getSession: (workflowId: string) => VibeCodingSession;
  initSession: (workflowId: string, savedHtml: string | null) => void;
  clearSession: (workflowId: string) => void;
  
  // Message management
  addMessage: (workflowId: string, message: Message) => void;
  updateLastMessage: (workflowId: string, content: string) => void;
  clearMessages: (workflowId: string) => void;
  
  // HTML management
  setCurrentHtml: (workflowId: string, html: string | null) => void;
  setSavedHtml: (workflowId: string, html: string | null) => void;
  
  // Status management
  setStatus: (workflowId: string, status: VibeCodingStatus) => void;
  setError: (workflowId: string, error: string | null) => void;
  
  // Computed
  isDirty: (workflowId: string) => boolean;
}

const defaultSession: VibeCodingSession = {
  workflowId: "",
  messages: [],
  currentHtml: null,
  savedHtml: null,
  status: "idle",
  error: null,
};

export const useVibeCodingStore = create<VibeCodingState>()(
  persist(
    (set, get) => ({
      sessions: {},

      getSession: (workflowId) => {
        return get().sessions[workflowId] || { ...defaultSession, workflowId };
      },

      initSession: (workflowId, savedHtml) => {
        set((state) => ({
          sessions: {
            ...state.sessions,
            [workflowId]: {
              ...defaultSession,
              workflowId,
              savedHtml,
              currentHtml: savedHtml,
            },
          },
        }));
      },

      clearSession: (workflowId) => {
        set((state) => {
          const { [workflowId]: _, ...rest } = state.sessions;
          return { sessions: rest };
        });
      },

      addMessage: (workflowId, message) => {
        set((state) => {
          const session = state.sessions[workflowId] || { ...defaultSession, workflowId };
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: {
                ...session,
                messages: [...session.messages, message],
              },
            },
          };
        });
      },

      updateLastMessage: (workflowId, content) => {
        set((state) => {
          const session = state.sessions[workflowId];
          if (!session || session.messages.length === 0) return state;
          
          const messages = [...session.messages];
          const lastMessage = { ...messages[messages.length - 1] };
          
          // Update text content of last message
          if (lastMessage.content && Array.isArray(lastMessage.content)) {
            lastMessage.content = lastMessage.content.map((c) =>
              c.type === "text" ? { ...c, text: content } : c
            );
          }
          messages[messages.length - 1] = lastMessage;
          
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, messages },
            },
          };
        });
      },

      clearMessages: (workflowId) => {
        set((state) => {
          const session = state.sessions[workflowId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, messages: [] },
            },
          };
        });
      },

      setCurrentHtml: (workflowId, html) => {
        set((state) => {
          const session = state.sessions[workflowId] || { ...defaultSession, workflowId };
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, currentHtml: html },
            },
          };
        });
      },

      setSavedHtml: (workflowId, html) => {
        set((state) => {
          const session = state.sessions[workflowId] || { ...defaultSession, workflowId };
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, savedHtml: html, currentHtml: html },
            },
          };
        });
      },

      setStatus: (workflowId, status) => {
        set((state) => {
          const session = state.sessions[workflowId] || { ...defaultSession, workflowId };
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, status },
            },
          };
        });
      },

      setError: (workflowId, error) => {
        set((state) => {
          const session = state.sessions[workflowId] || { ...defaultSession, workflowId };
          return {
            sessions: {
              ...state.sessions,
              [workflowId]: { ...session, error, status: error ? "error" : session.status },
            },
          };
        });
      },

      isDirty: (workflowId) => {
        const session = get().sessions[workflowId];
        if (!session) return false;
        return session.currentHtml !== session.savedHtml;
      },
    }),
    {
      name: "vibecoding-store",
      partialize: (state) => ({
        // Only persist sessions with unsaved changes
        sessions: Object.fromEntries(
          Object.entries(state.sessions).filter(
            ([_, session]) => session.currentHtml !== session.savedHtml
          )
        ),
      }),
    }
  )
);
```

---

#### Task 2: Create HTML Extraction Utility

**File:** `web/src/components/vibecoding/utils/extractHtml.ts`

Utility to extract HTML from agent responses.

```typescript
/**
 * Extract HTML content from a chat message response.
 * 
 * The agent returns HTML wrapped in ```html ... ``` code blocks.
 * This function extracts the HTML content from those blocks.
 */
export function extractHtmlFromResponse(content: string): string | null {
  if (!content) return null;

  // Try to match ```html ... ``` code block (most common)
  const htmlCodeBlockMatch = content.match(/```html\s*([\s\S]*?)```/i);
  if (htmlCodeBlockMatch) {
    const html = htmlCodeBlockMatch[1].trim();
    if (isValidHtmlDocument(html)) {
      return html;
    }
  }

  // Try to match ``` ... ``` without language specifier
  const genericCodeBlockMatch = content.match(/```\s*(<!DOCTYPE[\s\S]*?<\/html>)\s*```/i);
  if (genericCodeBlockMatch) {
    return genericCodeBlockMatch[1].trim();
  }

  // Try to match raw <!DOCTYPE html> ... </html>
  const rawHtmlMatch = content.match(/(<!DOCTYPE html>[\s\S]*<\/html>)/i);
  if (rawHtmlMatch) {
    return rawHtmlMatch[1].trim();
  }

  // Try to match <html> ... </html> without DOCTYPE
  const htmlTagMatch = content.match(/(<html[\s\S]*<\/html>)/i);
  if (htmlTagMatch) {
    // Add DOCTYPE if missing
    return `<!DOCTYPE html>\n${htmlTagMatch[1].trim()}`;
  }

  return null;
}

/**
 * Check if a string looks like a valid HTML document.
 */
export function isValidHtmlDocument(html: string): boolean {
  if (!html) return false;
  
  const hasDoctype = /<!DOCTYPE\s+html>/i.test(html);
  const hasHtmlTag = /<html[\s>]/i.test(html) && /<\/html>/i.test(html);
  const hasHead = /<head[\s>]/i.test(html) && /<\/head>/i.test(html);
  const hasBody = /<body[\s>]/i.test(html) && /<\/body>/i.test(html);
  
  // At minimum, should have html tags and either head or body
  return hasHtmlTag && (hasHead || hasBody);
}

/**
 * Inject runtime configuration into HTML document.
 */
export function injectRuntimeConfig(
  html: string,
  config: {
    apiUrl: string;
    wsUrl: string;
    workflowId: string;
  }
): string {
  const configScript = `
<script>
  window.NODETOOL_API_URL = "${config.apiUrl}";
  window.NODETOOL_WS_URL = "${config.wsUrl}";
  window.NODETOOL_WORKFLOW_ID = "${config.workflowId}";
</script>`;

  // Try to inject before </head>
  if (html.includes("</head>")) {
    return html.replace("</head>", `${configScript}\n</head>`);
  }

  // Fallback: inject after <body>
  if (html.includes("<body>")) {
    return html.replace("<body>", `<body>\n${configScript}`);
  }

  // Last resort: inject at the beginning
  return `${configScript}\n${html}`;
}
```

---

#### Task 3: Create VibeCodingPreview Component

**File:** `web/src/components/vibecoding/VibeCodingPreview.tsx`

Sandboxed iframe that renders the generated HTML.

```typescript
/** @jsxImportSource @emotion/react */
import React, { useMemo, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, IconButton, Tooltip, CircularProgress } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CodeIcon from "@mui/icons-material/Code";
import { API_URL, WORKER_URL } from "../../stores/BASE_URL";
import { injectRuntimeConfig } from "./utils/extractHtml";

const createStyles = (theme: any) => css({
  "&": {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: theme.palette.background.default,
    borderRadius: "8px",
    overflow: "hidden",
  },
  ".preview-header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  ".preview-title": {
    fontSize: "14px",
    fontWeight: 500,
    color: theme.palette.text.primary,
  },
  ".preview-actions": {
    display: "flex",
    gap: "4px",
  },
  ".preview-frame-container": {
    flex: 1,
    position: "relative",
    backgroundColor: "#ffffff",
  },
  ".preview-frame": {
    width: "100%",
    height: "100%",
    border: "none",
  },
  ".preview-empty": {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: theme.palette.text.secondary,
    textAlign: "center",
    padding: "24px",
  },
  ".preview-empty-icon": {
    fontSize: "48px",
    marginBottom: "16px",
    opacity: 0.5,
  },
  ".preview-loading": {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  },
});

interface VibeCodingPreviewProps {
  html: string | null;
  workflowId: string;
  isGenerating?: boolean;
  onViewSource?: () => void;
}

const VibeCodingPreview: React.FC<VibeCodingPreviewProps> = ({
  html,
  workflowId,
  isGenerating = false,
  onViewSource,
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Inject runtime configuration into HTML
  const processedHtml = useMemo(() => {
    if (!html) return null;
    
    return injectRuntimeConfig(html, {
      apiUrl: API_URL,
      wsUrl: WORKER_URL.replace("/ws", "/ws"), // Ensure correct WS URL
      workflowId,
    });
  }, [html, workflowId]);

  // Force iframe refresh
  const handleRefresh = useCallback(() => {
    setIframeKey((prev) => prev + 1);
  }, []);

  // Open in new tab
  const handleOpenInNew = useCallback(() => {
    if (!processedHtml) return;
    
    const blob = new Blob([processedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    
    // Clean up blob URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [processedHtml]);

  return (
    <Box css={styles}>
      <div className="preview-header">
        <Typography className="preview-title">
          Preview
          {isGenerating && " (Generating...)"}
        </Typography>
        <div className="preview-actions">
          {onViewSource && (
            <Tooltip title="View Source">
              <IconButton size="small" onClick={onViewSource}>
                <CodeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Refresh Preview">
            <IconButton size="small" onClick={handleRefresh} disabled={!html}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open in New Tab">
            <IconButton size="small" onClick={handleOpenInNew} disabled={!html}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <div className="preview-frame-container">
        {isGenerating && !html && (
          <div className="preview-loading">
            <CircularProgress size={32} />
          </div>
        )}

        {!html && !isGenerating && (
          <div className="preview-empty">
            <CodeIcon className="preview-empty-icon" />
            <Typography variant="body1" gutterBottom>
              No preview available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Describe your desired UI in the chat to generate a custom app
            </Typography>
          </div>
        )}

        {processedHtml && (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            className="preview-frame"
            srcDoc={processedHtml}
            sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
            title="VibeCoding Preview"
          />
        )}
      </div>
    </Box>
  );
};

export default VibeCodingPreview;
```

---

#### Task 4: Create VibeCodingChat Component

**File:** `web/src/components/vibecoding/VibeCodingChat.tsx`

Chat interface that communicates with the VibeCoding agent.

```typescript
/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, Button, Typography, Chip } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { Message, MessageContent, Workflow } from "../../stores/ApiTypes";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import { extractHtmlFromResponse } from "./utils/extractHtml";
import { client } from "../../stores/ApiClient";
import ChatView from "../chat/containers/ChatView";

const createStyles = (theme: any) => css({
  "&": {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: theme.palette.background.paper,
  },
  ".chat-header": {
    padding: "12px 16px",
    borderBottom: `1px solid ${theme.palette.divider}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ".chat-title": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  ".template-chips": {
    display: "flex",
    gap: "8px",
    padding: "8px 16px",
    borderBottom: `1px solid ${theme.palette.divider}`,
    flexWrap: "wrap",
  },
  ".chat-container": {
    flex: 1,
    overflow: "hidden",
  },
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
  onHtmlGenerated,
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  
  const {
    getSession,
    addMessage,
    updateLastMessage,
    setStatus,
    setError,
    setCurrentHtml,
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
        const response = await client.GET("/api/vibecoding/templates");
        if (response.data) {
          setTemplates(response.data as Template[]);
        }
      } catch (error) {
        console.error("Failed to load templates:", error);
      }
    };
    loadTemplates();
  }, []);

  // Send message to VibeCoding agent
  const sendMessage = useCallback(
    async (content: MessageContent[], prompt: string) => {
      if (!prompt.trim() || isStreaming) return;

      // Add user message
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: [{ type: "text", text: prompt }],
        created_at: new Date().toISOString(),
      };
      addMessage(workflow.id, userMessage);

      // Add placeholder assistant message
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: [{ type: "text", text: "" }],
        created_at: new Date().toISOString(),
      };
      addMessage(workflow.id, assistantMessage);

      setStatus(workflow.id, "streaming");
      setIsStreaming(true);
      setError(workflow.id, null);
      accumulatedResponseRef.current = "";

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/vibecoding/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workflow_id: workflow.id,
            prompt: prompt,
          }),
          signal: abortControllerRef.current.signal,
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
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          accumulatedResponseRef.current += chunk;
          
          // Update the last message with accumulated content
          updateLastMessage(workflow.id, accumulatedResponseRef.current);

          // Try to extract HTML from the accumulated response
          const extractedHtml = extractHtmlFromResponse(accumulatedResponseRef.current);
          if (extractedHtml) {
            setCurrentHtml(workflow.id, extractedHtml);
            onHtmlGenerated(extractedHtml);
          }
        }

        setStatus(workflow.id, "complete");
      } catch (error: any) {
        if (error.name === "AbortError") {
          setStatus(workflow.id, "idle");
        } else {
          console.error("VibeCoding error:", error);
          setError(workflow.id, error.message || "Failed to generate");
          setStatus(workflow.id, "error");
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [workflow.id, isStreaming, addMessage, updateLastMessage, setStatus, setError, setCurrentHtml, onHtmlGenerated]
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
      sendMessage([], template.prompt);
    },
    [sendMessage]
  );

  // Map session status to ChatView status
  const chatStatus = useMemo(() => {
    if (isStreaming) return "streaming";
    if (session.status === "error") return "error";
    return "connected";
  }, [isStreaming, session.status]);

  // Build welcome placeholder
  const welcomePlaceholder = useMemo(() => (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        textAlign: "center",
        p: 4,
      }}
    >
      <AutoFixHighIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
      <Typography variant="h6" gutterBottom>
        Design Your App
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
        Describe how you want your workflow's UI to look. Try something like:
        "Create a modern dark-themed interface with a gradient background"
      </Typography>
    </Box>
  ), []);

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
        />
      </div>
    </Box>
  );
};

export default VibeCodingChat;
```

---

#### Task 5: Create VibeCodingPanel Component

**File:** `web/src/components/vibecoding/VibeCodingPanel.tsx`

Main panel with split layout combining chat and preview.

```typescript
/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
  Snackbar,
  Alert,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import { Workflow } from "../../stores/ApiTypes";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import VibeCodingChat from "./VibeCodingChat";
import VibeCodingPreview from "./VibeCodingPreview";

const createStyles = (theme: any) => css({
  "&": {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: theme.palette.background.default,
  },
  ".panel-header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  ".panel-title": {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  ".panel-actions": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  ".panel-content": {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  ".chat-section": {
    width: "40%",
    minWidth: "300px",
    borderRight: `1px solid ${theme.palette.divider}`,
    display: "flex",
    flexDirection: "column",
  },
  ".preview-section": {
    flex: 1,
    minWidth: "400px",
    display: "flex",
    flexDirection: "column",
  },
  ".dirty-indicator": {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: theme.palette.warning.main,
  },
});

interface VibeCodingPanelProps {
  workflow: Workflow;
  onClose?: () => void;
}

const VibeCodingPanel: React.FC<VibeCodingPanelProps> = ({
  workflow,
  onClose,
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  
  const {
    getSession,
    initSession,
    setCurrentHtml,
    setSavedHtml,
    isDirty,
  } = useVibeCodingStore();
  
  const { updateWorkflow } = useWorkflowManager((state) => ({
    updateWorkflow: state.updateWorkflow,
  }));
  
  const session = getSession(workflow.id);
  const hasUnsavedChanges = isDirty(workflow.id);
  
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  // Initialize session with workflow's current html_app
  useEffect(() => {
    initSession(workflow.id, workflow.html_app || null);
  }, [workflow.id, workflow.html_app, initSession]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle HTML generated from chat
  const handleHtmlGenerated = useCallback(
    (html: string) => {
      setCurrentHtml(workflow.id, html);
    },
    [workflow.id, setCurrentHtml]
  );

  // Save HTML to workflow
  const handleSave = useCallback(async () => {
    if (!session.currentHtml) return;

    setIsSaving(true);
    try {
      await updateWorkflow(workflow.id, {
        html_app: session.currentHtml,
      });
      setSavedHtml(workflow.id, session.currentHtml);
      setSnackbar({
        open: true,
        message: "App saved successfully!",
        severity: "success",
      });
    } catch (error: any) {
      console.error("Failed to save:", error);
      setSnackbar({
        open: true,
        message: error.message || "Failed to save app",
        severity: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [workflow.id, session.currentHtml, updateWorkflow, setSavedHtml]);

  // Clear saved HTML (revert to default UI)
  const handleClearApp = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateWorkflow(workflow.id, {
        html_app: null,
      });
      setSavedHtml(workflow.id, null);
      setCurrentHtml(workflow.id, null);
      setShowClearDialog(false);
      setSnackbar({
        open: true,
        message: "Custom app removed. Workflow will use default UI.",
        severity: "success",
      });
    } catch (error: any) {
      console.error("Failed to clear:", error);
      setSnackbar({
        open: true,
        message: error.message || "Failed to clear app",
        severity: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [workflow.id, updateWorkflow, setSavedHtml, setCurrentHtml]);

  // Handle close with unsaved changes
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardDialog(true);
    } else {
      onClose?.();
    }
  }, [hasUnsavedChanges, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowDiscardDialog(false);
    setCurrentHtml(workflow.id, session.savedHtml);
    onClose?.();
  }, [workflow.id, session.savedHtml, setCurrentHtml, onClose]);

  return (
    <Box css={styles}>
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <Typography variant="h6">Design App UI</Typography>
          {hasUnsavedChanges && (
            <Tooltip title="Unsaved changes">
              <div className="dirty-indicator" />
            </Tooltip>
          )}
        </div>
        <div className="panel-actions">
          {session.savedHtml && (
            <Tooltip title="Remove custom app (use default UI)">
              <Button
                size="small"
                color="error"
                startIcon={<DeleteOutlineIcon />}
                onClick={() => setShowClearDialog(true)}
                disabled={isSaving}
              >
                Clear App
              </Button>
            </Tooltip>
          )}
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isSaving || !session.currentHtml}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
          {onClose && (
            <IconButton size="small" onClick={handleClose}>
              <CloseIcon />
            </IconButton>
          )}
        </div>
      </div>

      {/* Split Content */}
      <div className="panel-content">
        <div className="chat-section">
          <VibeCodingChat
            workflow={workflow}
            onHtmlGenerated={handleHtmlGenerated}
          />
        </div>
        <div className="preview-section">
          <VibeCodingPreview
            html={session.currentHtml}
            workflowId={workflow.id}
            isGenerating={session.status === "streaming"}
          />
        </div>
      </div>

      {/* Discard Changes Dialog */}
      <Dialog open={showDiscardDialog} onClose={() => setShowDiscardDialog(false)}>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes. Are you sure you want to close without saving?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDiscardDialog(false)}>Cancel</Button>
          <Button onClick={handleDiscardAndClose} color="error">
            Discard Changes
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={isSaving}>
            Save & Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear App Dialog */}
      <Dialog open={showClearDialog} onClose={() => setShowClearDialog(false)}>
        <DialogTitle>Remove Custom App?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove the custom app and the workflow will use the default MiniApp UI.
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowClearDialog(false)}>Cancel</Button>
          <Button onClick={handleClearApp} color="error" disabled={isSaving}>
            Remove App
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default VibeCodingPanel;
```

---

#### Task 6: Create VibeCodingModal Component

**File:** `web/src/components/vibecoding/VibeCodingModal.tsx`

Modal wrapper for the VibeCoding panel.

```typescript
/** @jsxImportSource @emotion/react */
import React from "react";
import { Dialog, DialogContent } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import VibeCodingPanel from "./VibeCodingPanel";

interface VibeCodingModalProps {
  open: boolean;
  workflow: Workflow | null;
  onClose: () => void;
}

const VibeCodingModal: React.FC<VibeCodingModalProps> = ({
  open,
  workflow,
  onClose,
}) => {
  if (!workflow) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: "90vw",
          height: "85vh",
          maxWidth: "1600px",
        },
      }}
    >
      <DialogContent sx={{ p: 0, display: "flex", flexDirection: "column" }}>
        <VibeCodingPanel workflow={workflow} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
};

export default VibeCodingModal;
```

---

#### Task 7: Create Index Export

**File:** `web/src/components/vibecoding/index.ts`

```typescript
export { default as VibeCodingPanel } from "./VibeCodingPanel";
export { default as VibeCodingModal } from "./VibeCodingModal";
export { default as VibeCodingChat } from "./VibeCodingChat";
export { default as VibeCodingPreview } from "./VibeCodingPreview";
export { useVibeCodingStore } from "../../stores/VibeCodingStore";
export * from "./utils/extractHtml";
```

---

#### Task 8: Update MiniAppPage for Custom HTML Rendering

**File:** `web/src/components/miniapps/MiniAppPage.tsx`

Add conditional rendering for custom HTML apps.

**Changes to make:**

1. Import the VibeCodingPreview component
2. Check if `workflow.html_app` exists
3. If yes, render the custom HTML in an iframe
4. If no, render the existing MiniAppInputsForm + MiniAppResults

```typescript
// Add import at top
import VibeCodingPreview from "../vibecoding/VibeCodingPreview";

// Inside the component, after loading workflow:
const MiniAppPage: React.FC = () => {
  // ... existing code ...

  const {
    data: workflow,
    isLoading,
    error
  } = useQuery({
    // ... existing query
  });

  // ... existing hooks ...

  // ADD THIS: Check for custom HTML app
  const hasCustomApp = Boolean(workflow?.html_app);

  // ... existing handlers ...

  return (
    <NodeContext.Provider value={activeNodeStore ?? null}>
      <Box
        css={styles}
        component="section"
        className="mini-app-page"
        sx={{
          marginLeft: `${leftOffset}px`,
          width: `calc(100% - ${leftOffset}px)`,
          transition: "margin-left 0.2s ease-out, width 0.2s ease-out"
        }}
      >
        {/* Loading State */}
        {isLoading && (
          <Box display="flex" justifyContent="center" py={8}>
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && (
          <Box py={4}>
            <Typography color="error">{error.message}</Typography>
          </Box>
        )}

        {/* ADD THIS: Custom HTML App */}
        {workflow && hasCustomApp && (
          <Box sx={{ height: "100%", width: "100%" }}>
            <VibeCodingPreview
              html={workflow.html_app!}
              workflowId={workflow.id}
            />
          </Box>
        )}

        {/* WRAP EXISTING UI: Only show when no custom app */}
        {workflow && !hasCustomApp && (
          <>
            {/* Existing MiniAppSidePanel, form, results, etc. */}
            <MiniAppSidePanel
              workflow={workflow}
              isRunning={runnerState === "running"}
            />
            {/* ... rest of existing JSX ... */}
          </>
        )}
      </Box>
    </NodeContext.Provider>
  );
};
```

---

#### Task 9: Add VibeCoding Entry Point in Workflow Editor

**File:** `web/src/components/workflow/panels/WorkflowSettingsPanel.tsx` (or similar settings panel)

Add a button to open the VibeCoding modal.

```typescript
// Add imports
import { useState } from "react";
import { Button } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { VibeCodingModal } from "../../vibecoding";

// Inside the component
const WorkflowSettingsPanel: React.FC = () => {
  const [vibeCodingOpen, setVibeCodingOpen] = useState(false);
  
  // Get current workflow from context/store
  const workflow = useCurrentWorkflow(); // adjust based on actual hook
  
  return (
    <>
      {/* Existing settings UI */}
      
      {/* Add VibeCoding button */}
      <Button
        variant="outlined"
        startIcon={<AutoFixHighIcon />}
        onClick={() => setVibeCodingOpen(true)}
        sx={{ mt: 2 }}
      >
        Design App UI
      </Button>
      
      {workflow?.html_app && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          This workflow has a custom app UI
        </Typography>
      )}
      
      {/* VibeCoding Modal */}
      <VibeCodingModal
        open={vibeCodingOpen}
        workflow={workflow}
        onClose={() => setVibeCodingOpen(false)}
      />
    </>
  );
};
```

---

#### Task 10: Add Route for Standalone VibeCoding Page (Optional)

**File:** `web/src/App.tsx` or router configuration

Add a dedicated route for VibeCoding if needed:

```typescript
import { VibeCodingPanel } from "./components/vibecoding";

// In router configuration:
<Route path="/vibecoding/:workflowId" element={<VibeCodingPage />} />

// VibeCodingPage component:
const VibeCodingPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const { fetchWorkflow } = useWorkflowManager();
  
  const { data: workflow, isLoading } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => fetchWorkflow(workflowId!),
    enabled: !!workflowId,
  });
  
  if (isLoading) return <CircularProgress />;
  if (!workflow) return <Typography>Workflow not found</Typography>;
  
  return <VibeCodingPanel workflow={workflow} />;
};
```

---

### File Structure Summary

```
web/src/
├── components/
│   ├── vibecoding/
│   │   ├── index.ts
│   │   ├── VibeCodingPanel.tsx
│   │   ├── VibeCodingModal.tsx
│   │   ├── VibeCodingChat.tsx
│   │   ├── VibeCodingPreview.tsx
│   │   └── utils/
│   │       └── extractHtml.ts
│   └── miniapps/
│       └── MiniAppPage.tsx  # Updated
├── stores/
│   └── VibeCodingStore.ts
```

---

### Testing Requirements

Create tests in `web/src/__tests__/components/vibecoding/`:

1. **extractHtml.test.ts**: Test HTML extraction from various response formats
2. **VibeCodingPreview.test.tsx**: Test iframe rendering, config injection, refresh
3. **VibeCodingStore.test.ts**: Test state management, dirty detection, persistence

```typescript
// Example: extractHtml.test.ts
import { extractHtmlFromResponse, isValidHtmlDocument, injectRuntimeConfig } from "../utils/extractHtml";

describe("extractHtmlFromResponse", () => {
  it("extracts HTML from ```html code block", () => {
    const response = "Here's your app:\n```html\n<!DOCTYPE html><html><head></head><body>Test</body></html>\n```";
    const html = extractHtmlFromResponse(response);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<body>Test</body>");
  });

  it("extracts HTML from generic code block", () => {
    const response = "```\n<!DOCTYPE html><html><head></head><body>Test</body></html>\n```";
    const html = extractHtmlFromResponse(response);
    expect(html).toBeTruthy();
  });

  it("extracts raw HTML without code block", () => {
    const response = "<!DOCTYPE html><html><head></head><body>Test</body></html>";
    const html = extractHtmlFromResponse(response);
    expect(html).toBeTruthy();
  });

  it("returns null for non-HTML content", () => {
    const response = "I can help you with that. What would you like?";
    expect(extractHtmlFromResponse(response)).toBeNull();
  });
});

describe("injectRuntimeConfig", () => {
  it("injects config before </head>", () => {
    const html = "<!DOCTYPE html><html><head></head><body></body></html>";
    const result = injectRuntimeConfig(html, {
      apiUrl: "http://test",
      wsUrl: "ws://test",
      workflowId: "123",
    });
    expect(result).toContain("window.NODETOOL_API_URL");
    expect(result).toContain("window.NODETOOL_WS_URL");
    expect(result).toContain("window.NODETOOL_WORKFLOW_ID");
  });
});
```

---

### Acceptance Criteria

1. **VibeCodingStore** correctly manages session state per workflow
2. **VibeCodingChat** sends prompts and streams responses from `/api/vibecoding/generate`
3. **VibeCodingPreview** renders HTML in sandboxed iframe with injected config
4. **VibeCodingPanel** shows split layout, handles save/discard, tracks dirty state
5. **MiniAppPage** renders custom HTML when `workflow.html_app` exists
6. **HTML extraction** works with various response formats (code blocks, raw HTML)
7. **Templates** load from API and insert prompts when clicked
8. **Unsaved changes** warning appears before close/navigation
9. **Save** persists HTML to workflow via `updateWorkflow`
10. **Clear App** removes `html_app` and reverts to default UI

---

### Dependencies

No new npm packages required. Uses existing:
- `@emotion/react` for styling
- `@mui/material` for UI components
- `zustand` for state management
- `@tanstack/react-query` for data fetching
- Existing chat components and websocket infrastructure
