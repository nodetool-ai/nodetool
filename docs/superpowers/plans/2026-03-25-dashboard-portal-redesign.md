# Dashboard Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the panel-based dashboard with a minimal, conversational Portal — centered input, progressive disclosure, inline setup, adaptive recents.

**Architecture:** Portal.tsx replaces Dashboard.tsx on the `/dashboard` route. It manages three states (`idle | setup | chatting`) and interacts with `GlobalChatStore` directly (not `useChatService`, which hard-codes navigation). Chat rendering reuses existing `ChatView` and message components. The setup flow renders as an inline chat message when no API key is detected.

**Tech Stack:** React 18, TypeScript, Emotion CSS-in-JS, MUI theme, Zustand (GlobalChatStore, SecretsStore), existing chat components (ChatView, ChatInputSection).

**Spec:** `docs/superpowers/specs/2026-03-25-dashboard-portal-redesign.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `web/src/components/portal/Portal.tsx` | Main container — state machine (`idle \| setup \| chatting`), layout, transitions |
| Create | `web/src/components/portal/PortalInput.tsx` | Centered input field with send button, search-as-you-type |
| Create | `web/src/components/portal/PortalRecents.tsx` | Mixed workflow/chat recents list, max 5, sorted by `updated_at` |
| Create | `web/src/components/portal/PortalSetupFlow.tsx` | Inline provider picker rendered as chat message bubble |
| Create | `web/src/components/portal/PortalSearchResults.tsx` | Dropdown overlay for search matches |
| Create | `web/src/components/portal/usePortalChat.ts` | Hook wrapping `GlobalChatStore` without navigation side-effects |
| Modify | `web/src/index.tsx:235-242` | Replace Dashboard with Portal on `/dashboard` route, remove PanelLeft/PanelBottom |

---

## Chunk 1: Core Portal Shell

### Task 1: Create `usePortalChat` hook

This hook wraps `GlobalChatStore` with the same API surface as `useChatService` but without `navigate()` calls. The Portal uses this instead of `useChatService`.

**Files:**
- Create: `web/src/components/portal/usePortalChat.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// web/src/components/portal/usePortalChat.ts
import { useCallback } from "react";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LanguageModel, Message } from "../../stores/ApiTypes";

export function usePortalChat() {
  const status = useGlobalChatStore((s) => s.status);
  const threads = useGlobalChatStore((s) => s.threads);
  const currentThreadId = useGlobalChatStore((s) => s.currentThreadId);
  const progress = useGlobalChatStore((s) => s.progress);
  const statusMessage = useGlobalChatStore((s) => s.statusMessage);
  const selectedModel = useGlobalChatStore((s) => s.selectedModel);
  const currentPlanningUpdate = useGlobalChatStore((s) => s.currentPlanningUpdate);
  const currentTaskUpdate = useGlobalChatStore((s) => s.currentTaskUpdate);
  const currentLogUpdate = useGlobalChatStore((s) => s.currentLogUpdate);
  const messageCache = useGlobalChatStore((s) => s.messageCache);
  const agentMode = useGlobalChatStore((s) => s.agentMode);
  const selectedTools = useGlobalChatStore((s) => s.selectedTools);

  const sendMessage = useCallback(async (message: Message) => {
    const store = useGlobalChatStore.getState();
    let threadId = store.currentThreadId;
    if (!threadId) {
      threadId = await store.createNewThread();
      if (threadId) {
        store.switchThread(threadId);
      }
    }
    if (threadId) {
      await store.sendMessage(message);
    }
  }, []);

  const newThread = useCallback(async () => {
    const store = useGlobalChatStore.getState();
    const threadId = await store.createNewThread();
    if (threadId) {
      store.switchThread(threadId);
    }
    return threadId;
  }, []);

  const selectThread = useCallback((threadId: string) => {
    const store = useGlobalChatStore.getState();
    store.switchThread(threadId);
    store.loadMessages(threadId);
  }, []);

  const deleteThread = useCallback(async (threadId: string) => {
    await useGlobalChatStore.getState().deleteThread(threadId);
  }, []);

  const stopGeneration = useCallback(() => {
    useGlobalChatStore.getState().stopGeneration();
  }, []);

  const setSelectedModel = useCallback((model: LanguageModel) => {
    useGlobalChatStore.setState({ selectedModel: model });
  }, []);

  const setAgentMode = useCallback((enabled: boolean) => {
    useGlobalChatStore.setState({ agentMode: enabled });
  }, []);

  const setSelectedTools = useCallback((tools: string[]) => {
    useGlobalChatStore.setState({ selectedTools: tools });
  }, []);

  const messages = currentThreadId ? (messageCache[currentThreadId] ?? []) : [];

  return {
    status,
    threads,
    currentThreadId,
    progress,
    statusMessage,
    selectedModel,
    selectedTools,
    agentMode,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate,
    messages,
    sendMessage,
    newThread,
    selectThread,
    deleteThread,
    stopGeneration,
    setSelectedModel,
    setAgentMode,
    setSelectedTools,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | grep -i "usePortalChat" | head -20`
Expected: No errors related to this file

- [ ] **Step 3: Commit**

```bash
git add web/src/components/portal/usePortalChat.ts
git commit -m "feat(portal): add usePortalChat hook wrapping GlobalChatStore without navigation"
```

---

### Task 2: Create `PortalRecents` component

**Files:**
- Create: `web/src/components/portal/PortalRecents.tsx`

- [ ] **Step 1: Create the component**

```typescript
// web/src/components/portal/PortalRecents.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import { Thread, Workflow } from "../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    maxWidth: 440,
    margin: "0 auto",
    paddingTop: 16,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    ".portal-recent-item": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 0",
      cursor: "pointer",
      borderRadius: 6,
      transition: "opacity 0.15s ease",
      "&:hover": {
        opacity: 0.8,
      },
    },
    ".portal-recent-icon": {
      fontSize: 11,
      color: theme.palette.c_gray4,
      width: 16,
      textAlign: "center" as const,
    },
    ".portal-recent-title": {
      fontSize: 12,
      color: theme.palette.c_gray4,
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
    },
    ".portal-recent-time": {
      fontSize: 10,
      color: theme.palette.c_gray5,
    },
  });

type RecentItem = {
  id: string;
  title: string;
  updatedAt: string;
  type: "workflow" | "chat";
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const diffWeek = Math.floor(diffDay / 7);
  return `${diffWeek}w`;
}

type PortalRecentsProps = {
  workflows: Workflow[];
  threads: Record<string, Thread>;
  onWorkflowClick: (workflowId: string) => void;
  onThreadClick: (threadId: string) => void;
};

const PortalRecents: React.FC<PortalRecentsProps> = ({
  workflows,
  threads,
  onWorkflowClick,
  onThreadClick,
}) => {
  const theme = useTheme();

  const recentItems = useMemo(() => {
    const items: RecentItem[] = [];

    workflows.forEach((w) => {
      items.push({
        id: w.id,
        title: w.name || "Untitled Workflow",
        updatedAt: w.updated_at || w.created_at || "",
        type: "workflow",
      });
    });

    Object.values(threads).forEach((t) => {
      items.push({
        id: t.id,
        title: t.title || "Untitled Chat",
        updatedAt: t.updated_at || t.created_at || "",
        type: "chat",
      });
    });

    items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return items.slice(0, 5);
  }, [workflows, threads]);

  if (recentItems.length === 0) return null;

  return (
    <div css={styles(theme)}>
      {recentItems.map((item) => (
        <div
          key={`${item.type}-${item.id}`}
          className="portal-recent-item"
          onClick={() =>
            item.type === "workflow"
              ? onWorkflowClick(item.id)
              : onThreadClick(item.id)
          }
        >
          <span className="portal-recent-icon">
            {item.type === "chat" ? "💬" : "⚡"}
          </span>
          <span className="portal-recent-title">{item.title}</span>
          <span className="portal-recent-time">
            {formatRelativeTime(item.updatedAt)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default memo(PortalRecents);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | grep -i "PortalRecents" | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/portal/PortalRecents.tsx
git commit -m "feat(portal): add PortalRecents component for mixed workflow/chat list"
```

---

### Task 3: Create `PortalInput` component

**Files:**
- Create: `web/src/components/portal/PortalInput.tsx`

- [ ] **Step 1: Create the component**

```typescript
// web/src/components/portal/PortalInput.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback, useRef, useState } from "react";
import { IconButton } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    maxWidth: 440,
    margin: "0 auto",
    background: theme.palette.c_gray1,
    border: `1px solid ${theme.palette.c_gray2}`,
    borderRadius: 12,
    padding: "14px 16px",
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    ".portal-input-textarea": {
      flex: 1,
      background: "transparent",
      border: "none",
      outline: "none",
      color: theme.palette.c_white,
      fontSize: 14,
      fontFamily: "inherit",
      resize: "none" as const,
      lineHeight: 1.5,
      maxHeight: 120,
      overflowY: "auto" as const,
      "&::placeholder": {
        color: theme.palette.c_gray4,
      },
    },
    ".portal-input-send": {
      width: 28,
      height: 28,
      minWidth: 28,
      backgroundColor: theme.palette.primary.main,
      borderRadius: "50%",
      color: "white",
      "&:hover": {
        backgroundColor: theme.palette.primary.dark,
      },
      "&.Mui-disabled": {
        backgroundColor: theme.palette.c_gray3,
        color: theme.palette.c_gray5,
      },
    },
  });

type PortalInputProps = {
  onSend: (text: string) => void;
  onSearchChange?: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

const PortalInput: React.FC<PortalInputProps> = ({
  onSend,
  onSearchChange,
  placeholder = "Type here...",
  disabled = false,
}) => {
  const theme = useTheme();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setValue(val);
      // Auto-resize
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
      onSearchChange?.(val);
    },
    [onSearchChange]
  );

  return (
    <div css={styles(theme)}>
      <textarea
        ref={textareaRef}
        className="portal-input-textarea"
        rows={1}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoFocus
      />
      <IconButton
        className="portal-input-send"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        size="small"
      >
        <ArrowUpwardIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </div>
  );
};

export default memo(PortalInput);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | grep -i "PortalInput" | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/portal/PortalInput.tsx
git commit -m "feat(portal): add PortalInput component with send and search-as-you-type"
```

---

### Task 4: Create `PortalSearchResults` component

**Files:**
- Create: `web/src/components/portal/PortalSearchResults.tsx`

- [ ] **Step 1: Create the component**

```typescript
// web/src/components/portal/PortalSearchResults.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import { Workflow } from "../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    background: theme.palette.c_gray1,
    border: `1px solid ${theme.palette.c_gray2}`,
    borderRadius: 10,
    overflow: "hidden",
    zIndex: 100,
    animation: "portalSearchSlideDown 200ms ease-out",
    "@keyframes portalSearchSlideDown": {
      from: { opacity: 0, transform: "translateY(-4px)" },
      to: { opacity: 1, transform: "translateY(0)" },
    },
    ".portal-search-item": {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 14px",
      cursor: "pointer",
      transition: "background 0.1s",
      "&:hover": {
        background: theme.palette.c_gray2,
      },
    },
    ".portal-search-icon": {
      fontSize: 12,
      color: theme.palette.c_gray4,
    },
    ".portal-search-title": {
      fontSize: 13,
      color: theme.palette.c_white,
    },
    ".portal-search-type": {
      fontSize: 10,
      color: theme.palette.c_gray5,
      marginLeft: "auto",
    },
  });

type PortalSearchResultsProps = {
  query: string;
  workflows: Workflow[];
  templates: Workflow[];
  onSelectWorkflow: (workflowId: string) => void;
  onSelectTemplate: (templateId: string) => void;
};

type SearchResult = {
  id: string;
  title: string;
  type: "workflow" | "template";
};

const PortalSearchResults: React.FC<PortalSearchResultsProps> = ({
  query,
  workflows,
  templates,
  onSelectWorkflow,
  onSelectTemplate,
}) => {
  const theme = useTheme();

  const results = useMemo(() => {
    if (!query || query.length < 2) return [];

    const q = query.toLowerCase();
    const matches: SearchResult[] = [];

    workflows.forEach((w) => {
      if ((w.name || "").toLowerCase().includes(q)) {
        matches.push({ id: w.id, title: w.name || "Untitled", type: "workflow" });
      }
    });

    templates.forEach((t) => {
      if ((t.name || "").toLowerCase().includes(q)) {
        matches.push({ id: t.id, title: t.name || "Untitled", type: "template" });
      }
    });

    return matches.slice(0, 5);
  }, [query, workflows, templates]);

  if (results.length === 0) return null;

  return (
    <div css={styles(theme)}>
      {results.map((r) => (
        <div
          key={`${r.type}-${r.id}`}
          className="portal-search-item"
          onClick={() =>
            r.type === "workflow"
              ? onSelectWorkflow(r.id)
              : onSelectTemplate(r.id)
          }
        >
          <span className="portal-search-icon">
            {r.type === "workflow" ? "⚡" : "📋"}
          </span>
          <span className="portal-search-title">{r.title}</span>
          <span className="portal-search-type">{r.type}</span>
        </div>
      ))}
    </div>
  );
};

export default memo(PortalSearchResults);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | grep -i "PortalSearch" | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/portal/PortalSearchResults.tsx
git commit -m "feat(portal): add PortalSearchResults dropdown component"
```

---

### Task 5: Create `PortalSetupFlow` component

**Files:**
- Create: `web/src/components/portal/PortalSetupFlow.tsx`

- [ ] **Step 1: Create the component**

```typescript
// web/src/components/portal/PortalSetupFlow.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useState, useCallback } from "react";
import { TextField, Button, CircularProgress } from "@mui/material";
import useSecretsStore from "../../stores/SecretsStore";

const styles = (theme: Theme) =>
  css({
    maxWidth: 400,
    ".portal-setup-text": {
      fontSize: 14,
      color: theme.palette.c_gray6,
      lineHeight: 1.6,
      marginBottom: 14,
    },
    ".portal-setup-providers": {
      display: "flex",
      flexDirection: "column",
      gap: 6,
    },
    ".portal-setup-provider": {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: theme.palette.c_gray1,
      border: `1px solid ${theme.palette.c_gray2}`,
      borderRadius: 10,
      padding: "12px 14px",
      cursor: "pointer",
      transition: "border-color 0.15s",
      "&:hover": {
        borderColor: theme.palette.c_gray3,
      },
    },
    ".portal-setup-provider-icon": {
      width: 28,
      height: 28,
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 14,
      color: "white",
      fontWeight: "bold",
    },
    ".portal-setup-provider-info": {
      flex: 1,
    },
    ".portal-setup-provider-name": {
      fontSize: 13,
      color: theme.palette.c_white,
    },
    ".portal-setup-provider-desc": {
      fontSize: 11,
      color: theme.palette.c_gray4,
    },
    ".portal-setup-connect": {
      fontSize: 12,
      color: theme.palette.primary.main,
    },
    ".portal-setup-key-input": {
      marginTop: 8,
      display: "flex",
      gap: 8,
      alignItems: "center",
    },
    ".portal-setup-note": {
      fontSize: 11,
      color: theme.palette.c_gray4,
      marginTop: 10,
      textAlign: "center" as const,
    },
    ".portal-setup-ollama-status": {
      fontSize: 12,
      color: theme.palette.c_gray5,
      marginTop: 6,
      padding: "8px 12px",
      background: theme.palette.c_gray1,
      borderRadius: 8,
    },
  });

type Provider = {
  id: string;
  name: string;
  description: string;
  secretKey: string;
  color: string;
  defaultModel: string;
};

const PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, DALL-E, Whisper",
    secretKey: "OPENAI_API_KEY",
    color: "#10a37f",
    defaultModel: "openai:gpt-4o",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude Sonnet, Haiku",
    secretKey: "ANTHROPIC_API_KEY",
    color: "#d97706",
    defaultModel: "anthropic:claude-sonnet-4-20250514",
  },
];

type PortalSetupFlowProps = {
  onComplete: (defaultModel: string) => void;
};

const PortalSetupFlow: React.FC<PortalSetupFlowProps> = ({ onComplete }) => {
  const theme = useTheme();
  const updateSecret = useSecretsStore((s) => s.updateSecret);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<
    "unchecked" | "checking" | "running" | "not-running"
  >("unchecked");

  const handleProviderClick = useCallback(
    (provider: Provider) => {
      setExpandedProvider(provider.id);
      setKeyValue("");
    },
    []
  );

  const handleOllamaClick = useCallback(async () => {
    setOllamaStatus("checking");
    try {
      const res = await fetch("http://localhost:11434/api/tags");
      if (res.ok) {
        setOllamaStatus("running");
        onComplete("ollama:llama3.2");
      } else {
        setOllamaStatus("not-running");
      }
    } catch {
      setOllamaStatus("not-running");
    }
  }, [onComplete]);

  const handleSaveKey = useCallback(
    async (provider: Provider) => {
      if (!keyValue.trim()) return;
      setSaving(true);
      try {
        await updateSecret(provider.secretKey, keyValue.trim());
        onComplete(provider.defaultModel);
      } catch {
        // Error handled by SecretsStore
      } finally {
        setSaving(false);
      }
    },
    [keyValue, updateSecret, onComplete]
  );

  return (
    <div css={styles(theme)}>
      <div className="portal-setup-text">
        I'd love to help with that! To get started, connect an AI provider:
      </div>

      <div className="portal-setup-providers">
        {PROVIDERS.map((provider) => (
          <div key={provider.id}>
            <div
              className="portal-setup-provider"
              onClick={() => handleProviderClick(provider)}
            >
              <div
                className="portal-setup-provider-icon"
                style={{ backgroundColor: provider.color }}
              >
                {provider.name[0]}
              </div>
              <div className="portal-setup-provider-info">
                <div className="portal-setup-provider-name">
                  {provider.name}
                </div>
                <div className="portal-setup-provider-desc">
                  {provider.description}
                </div>
              </div>
              <span className="portal-setup-connect">Connect →</span>
            </div>

            {expandedProvider === provider.id && (
              <div className="portal-setup-key-input">
                <TextField
                  size="small"
                  type="password"
                  placeholder={`${provider.name} API Key`}
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveKey(provider);
                  }}
                  fullWidth
                  autoFocus
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => handleSaveKey(provider)}
                  disabled={saving || !keyValue.trim()}
                >
                  {saving ? <CircularProgress size={16} /> : "Save"}
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Ollama (no API key) */}
        <div className="portal-setup-provider" onClick={handleOllamaClick}>
          <div
            className="portal-setup-provider-icon"
            style={{ backgroundColor: "#666" }}
          >
            ⬇
          </div>
          <div className="portal-setup-provider-info">
            <div className="portal-setup-provider-name">Run locally</div>
            <div className="portal-setup-provider-desc">
              Ollama, no API key needed
            </div>
          </div>
          <span className="portal-setup-connect">Set up →</span>
        </div>
        {ollamaStatus === "checking" && (
          <div className="portal-setup-ollama-status">
            Checking if Ollama is running...
          </div>
        )}
        {ollamaStatus === "running" && (
          <div className="portal-setup-ollama-status" style={{ color: "#4caf50" }}>
            ✓ Ollama is running. Connecting...
          </div>
        )}
        {ollamaStatus === "not-running" && (
          <div className="portal-setup-ollama-status">
            Ollama is not running. Install it from{" "}
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#6688cc" }}
            >
              ollama.com
            </a>{" "}
            and start it, then try again.
          </div>
        )}
      </div>

      <div className="portal-setup-note">
        You can add more providers later in settings
      </div>
    </div>
  );
};

export default memo(PortalSetupFlow);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | grep -i "PortalSetup" | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/portal/PortalSetupFlow.tsx
git commit -m "feat(portal): add PortalSetupFlow inline provider picker component"
```

---

## Chunk 2: Main Portal Component and Route Wiring

### Task 6: Create `Portal.tsx` — the main container

This is the core component that replaces Dashboard. It manages the `idle | setup | chatting` state machine, renders all sub-components, and handles transitions.

**Files:**
- Create: `web/src/components/portal/Portal.tsx`

- [ ] **Step 1: Create the Portal component**

```typescript
// web/src/components/portal/Portal.tsx
/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
import IconButton from "@mui/material/IconButton";
import AddIcon from "@mui/icons-material/Add";
import PortalInput from "./PortalInput";
import PortalRecents from "./PortalRecents";
import PortalSearchResults from "./PortalSearchResults";
import PortalSetupFlow from "./PortalSetupFlow";
import { usePortalChat } from "./usePortalChat";
import { useNavigate } from "react-router-dom";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import useSecretsStore from "../../stores/SecretsStore";
import { useEnsureChatConnected } from "../../hooks/useEnsureChatConnected";
import { usePanelStore } from "../../stores/PanelStore";
import { Message, MessageContent, LanguageModel } from "../../stores/ApiTypes";
import ChatView from "../chat/containers/ChatView";
import AppHeader from "../panels/AppHeader";

const KNOWN_PROVIDER_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "HUGGINGFACE_API_KEY",
];

type PortalState = "idle" | "setup" | "chatting";

const fadeOut = keyframes`
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-20px); }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const styles = (theme: Theme) =>
  css({
    width: "100vw",
    height: "100vh",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: theme.palette.c_editor_bg_color,

    ".portal-center": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 24px",
      paddingTop: 64,
    },
    ".portal-heading": {
      fontSize: 24,
      fontWeight: 200,
      color: theme.palette.c_gray5,
      marginBottom: 24,
      letterSpacing: "-0.3px",
      textAlign: "center" as const,
      lineHeight: 1.4,
    },
    ".portal-input-wrapper": {
      width: "100%",
      maxWidth: 440,
      position: "relative",
    },
    ".portal-hint": {
      fontSize: 11,
      color: theme.palette.c_gray3,
      textAlign: "center" as const,
      marginTop: 16,
    },

    // Transition states
    "&.portal-state-idle .portal-heading": {
      animation: "none",
    },
    "&.portal-transitioning .portal-heading": {
      animation: `${fadeOut} 300ms ease-out forwards`,
    },
    "&.portal-transitioning .portal-recents": {
      animation: `${fadeOut} 200ms ease-out forwards`,
    },

    // Chatting state
    ".portal-chat-container": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      width: "100%",
      paddingTop: 64,
      animation: `${fadeIn} 300ms ease-out`,
    },
    ".portal-chat-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      padding: "8px 16px",
    },
    ".portal-new-chat-btn": {
      color: theme.palette.c_gray4,
      "&:hover": {
        color: theme.palette.c_white,
      },
    },
    ".portal-setup-message": {
      maxWidth: 480,
      padding: "16px 20px",
      margin: "20px auto",
      animation: `${fadeIn} 300ms ease-out`,
    },
  });

const Portal: React.FC = () => {
  const theme = useTheme();
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEnsureChatConnected({ disconnectOnUnmount: false });

  // Close panelLeft when portal is opened
  useEffect(() => {
    usePanelStore.getState().setVisibility(false);
  }, []);

  const {
    status,
    threads,
    currentThreadId,
    progress,
    statusMessage,
    selectedModel,
    selectedTools,
    agentMode,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate,
    messages,
    sendMessage,
    newThread,
    selectThread,
    deleteThread,
    stopGeneration,
    setSelectedModel,
    setAgentMode,
    setSelectedTools,
  } = usePortalChat();

  const {
    sortedWorkflows,
    startTemplates,
  } = useDashboardData();

  const navigate = useNavigate();
  const {
    handleExampleClick,
  } = useWorkflowActions();

  const fetchSecrets = useSecretsStore((s) => s.fetchSecrets);
  const secrets = useSecretsStore((s) => s.secrets);

  // Fetch secrets on mount to know if providers are configured
  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const hasConfiguredProvider = useMemo(() => {
    return secrets.some((s) =>
      KNOWN_PROVIDER_KEYS.includes(s.key) && s.is_configured
    );
  }, [secrets]);

  const isReturningUser = useMemo(() => {
    return sortedWorkflows.length > 0 || Object.keys(threads).length > 0;
  }, [sortedWorkflows, threads]);

  // Search debounce
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 200);
  }, []);

  // Transition to chatting
  const transitionToChat = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setIsTransitioning(false);
      setPortalState("chatting");
    }, 400);
  }, []);

  // Handle send from idle state
  const handleIdleSend = useCallback(
    async (text: string) => {
      setSearchQuery("");
      setDebouncedQuery("");

      if (!hasConfiguredProvider) {
        setPendingMessage(text);
        transitionToChat();
        // After transition completes, show setup
        setTimeout(() => setPortalState("setup"), 450);
        return;
      }

      transitionToChat();

      // Create a message and send it after transition
      setTimeout(async () => {
        const content: MessageContent[] = [{ type: "text", text }];
        const message: Message = {
          role: "user",
          content,
          thread_id: currentThreadId || "",
          created_at: new Date().toISOString(),
        };
        await sendMessage(message);
      }, 450);
    },
    [hasConfiguredProvider, transitionToChat, sendMessage, currentThreadId]
  );

  // Handle send from chatting state — matches ChatView's sendMessage: (message: Message) => Promise<void>
  const handleChatSend = useCallback(
    async (message: Message) => {
      await sendMessage(message);
    },
    [sendMessage]
  );

  // Handle setup completion
  const handleSetupComplete = useCallback(
    async (defaultModel: string) => {
      // Parse "provider:id" format into a proper LanguageModel object
      const [provider, ...idParts] = defaultModel.split(":");
      const id = idParts.join(":");
      const model: LanguageModel = {
        type: "language_model",
        provider: provider as LanguageModel["provider"],
        id: id,
        name: id,
      };
      setSelectedModel(model);
      setPortalState("chatting");

      // Send the pending message
      if (pendingMessage) {
        const content: MessageContent[] = [{ type: "text", text: pendingMessage }];
        const message: Message = {
          role: "user",
          content,
          thread_id: currentThreadId || "",
          created_at: new Date().toISOString(),
        };
        setPendingMessage(null);
        // Small delay to let model state propagate
        setTimeout(async () => {
          await sendMessage(message);
        }, 100);
      }
    },
    [pendingMessage, setSelectedModel, sendMessage, currentThreadId]
  );

  // Handle clicking a recent chat thread
  const handleThreadClick = useCallback(
    (threadId: string) => {
      selectThread(threadId);
      setPortalState("chatting");
    },
    [selectThread]
  );

  // Handle clicking a recent workflow — navigate directly (useWorkflowActions expects Workflow objects)
  const handleWorkflowItemClick = useCallback(
    (workflowId: string) => {
      navigate(`/editor/${workflowId}`);
    },
    [navigate]
  );

  // Handle new chat
  const handleNewChat = useCallback(async () => {
    await newThread();
    setPortalState("idle");
    setSearchQuery("");
    setDebouncedQuery("");
  }, [newThread]);

  // Handle template selection from search — find full Workflow object for handleExampleClick
  const handleTemplateSelect = useCallback(
    (templateId: string) => {
      const template = startTemplates.find((t) => t.id === templateId);
      if (template) {
        handleExampleClick(template);
      }
    },
    [handleExampleClick, startTemplates]
  );

  const handleModelChange = useCallback(
    (model: LanguageModel) => {
      setSelectedModel(model);
    },
    [setSelectedModel]
  );

  const handleToolsChange = useCallback(
    (tools: string[]) => {
      setSelectedTools(tools);
    },
    [setSelectedTools]
  );

  const handleAgentModeToggle = useCallback(
    (enabled: boolean) => {
      setAgentMode(enabled);
    },
    [setAgentMode]
  );

  // IDLE state
  if (portalState === "idle" || isTransitioning) {
    return (
      <Box
        css={styles(theme)}
        className={`portal-state-idle ${isTransitioning ? "portal-transitioning" : ""}`}
      >
        <AppHeader />
        <div className="portal-center">
          <div className="portal-heading">
            {isReturningUser ? (
              <>
                Welcome back.
                <br />
                What's next?
              </>
            ) : (
              "What shall we build?"
            )}
          </div>

          <div className="portal-input-wrapper">
            <PortalInput
              onSend={handleIdleSend}
              onSearchChange={handleSearchChange}
            />
            {debouncedQuery.length >= 2 && (
              <PortalSearchResults
                query={debouncedQuery}
                workflows={sortedWorkflows}
                templates={startTemplates}
                onSelectWorkflow={handleWorkflowItemClick}
                onSelectTemplate={handleTemplateSelect}
              />
            )}
          </div>

          {!isTransitioning && (
            <div className="portal-recents">
              <PortalRecents
                workflows={sortedWorkflows}
                threads={threads}
                onWorkflowClick={handleWorkflowItemClick}
                onThreadClick={handleThreadClick}
              />
            </div>
          )}

          {!isReturningUser && !isTransitioning && (
            <div className="portal-hint">Type anything to get started</div>
          )}
        </div>
      </Box>
    );
  }

  // SETUP state
  if (portalState === "setup") {
    return (
      <Box css={styles(theme)}>
        <AppHeader />
        <div className="portal-chat-container">
          <div className="portal-chat-header">
            <IconButton
              className="portal-new-chat-btn"
              onClick={handleNewChat}
              size="small"
              title="New chat"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </div>
          <div className="portal-setup-message">
            <PortalSetupFlow onComplete={handleSetupComplete} />
          </div>
        </div>
      </Box>
    );
  }

  // CHATTING state
  return (
    <Box css={styles(theme)}>
      <AppHeader />
      <div className="portal-chat-container">
        <div className="portal-chat-header">
          <IconButton
            className="portal-new-chat-btn"
            onClick={handleNewChat}
            size="small"
            title="New chat"
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </div>
        <ChatView
          status={status}
          progress={progress.current}
          total={progress.total}
          messages={messages}
          model={selectedModel}
          sendMessage={handleChatSend}
          progressMessage={statusMessage}
          selectedTools={selectedTools}
          onToolsChange={handleToolsChange}
          onModelChange={handleModelChange}
          agentMode={agentMode}
          onAgentModeToggle={handleAgentModeToggle}
          currentPlanningUpdate={currentPlanningUpdate}
          currentTaskUpdate={currentTaskUpdate}
          currentLogUpdate={currentLogUpdate}
          onStop={stopGeneration}
          onNewChat={handleNewChat}
        />
      </div>
    </Box>
  );
};

export default memo(Portal);
```

**Important:** The exact `ChatView` props may need adjustment based on the actual `ChatViewProps` interface (explored above). The key props are `status`, `progress`, `total`, `messages`, `sendMessage`, and the model/tool/agent controls. Check the actual interface at `web/src/components/chat/containers/ChatView.tsx:56-101` and adapt.

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | grep -i "portal" | head -30`

If there are type errors with `ChatView` props, adjust the Portal to match the actual `ChatViewProps` interface. Common fixes:
- `sendMessage` signature may need `(content: MessageContent[], prompt: string, agentMode: boolean) => Promise<void>`
- Some props may be named differently
- `LanguageModel` may need to be cast

- [ ] **Step 3: Commit**

```bash
git add web/src/components/portal/Portal.tsx
git commit -m "feat(portal): add main Portal component with idle/setup/chatting states"
```

---

### Task 7: Wire Portal into the router

Replace Dashboard with Portal on the `/dashboard` route and remove PanelLeft/PanelBottom wrappers.

**Files:**
- Modify: `web/src/index.tsx:235-242` (dashboard route)

- [ ] **Step 1: Add lazy import for Portal**

At the top of `web/src/index.tsx`, near the other lazy imports (around line 89), add:

```typescript
const Portal = React.lazy(() => import("./components/portal/Portal"));
```

- [ ] **Step 2: Replace the dashboard route**

Find the dashboard route block (lines 235-242):
```typescript
{
  path: "/dashboard",
  element: (
    <ProtectedRoute>
      <PanelLeft />
      <Dashboard />
      <PanelBottom />
    </ProtectedRoute>
  )
}
```

Replace with:
```typescript
{
  path: "/dashboard",
  element: (
    <ProtectedRoute>
      <Portal />
    </ProtectedRoute>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Verify the app runs**

Run: `cd /Users/mg/workspace/nodetool/web && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add web/src/index.tsx
git commit -m "feat(portal): wire Portal into dashboard route, replace Dashboard + panels"
```

---

## Chunk 3: Polish and Integration

### Task 8: Visual polish and transition refinement

After Tasks 1-7, the Portal should be functional. This task handles visual polish: ensuring the dark theme looks right, transitions are smooth, and the chat view integrates cleanly.

**Files:**
- Modify: `web/src/components/portal/Portal.tsx` (styling adjustments)
- Modify: `web/src/components/portal/PortalInput.tsx` (styling adjustments)

- [ ] **Step 1: Test the Portal in the browser**

Run: `cd /Users/mg/workspace/nodetool/web && npm start`

Open `http://localhost:3000/dashboard` and verify:
1. Idle state shows heading + input centered
2. Typing in the input works
3. Search results appear when typing workflow/template names
4. Recent items appear if you have workflows/chats
5. Sending a message transitions to chat view
6. Chat view shows messages and input at bottom

- [ ] **Step 2: Fix any visual issues found**

Common adjustments:
- Background color may need to match the theme's `c_editor_bg_color`
- Font sizes may need tuning for the heading
- Input border colors may need adjustment
- Transition timing may need tweaking
- Chat view may need padding adjustments to avoid overlapping AppHeader

Fix issues as found. Each fix should be a targeted CSS change in the relevant component's styles.

- [ ] **Step 3: Test the setup flow**

1. Clear all secrets (or use a fresh user state)
2. Open `/dashboard`
3. Type a message and send
4. Verify the setup flow appears inline
5. Enter an API key and save
6. Verify the message gets sent

- [ ] **Step 4: Test state transitions**

1. Send a message → verify transition to chat
2. Click "New Chat" button → verify return to idle
3. Click a recent chat → verify transition to chat with thread loaded
4. Click a recent workflow → verify navigation to editor

- [ ] **Step 5: Commit**

```bash
git add web/src/components/portal/
git commit -m "fix(portal): visual polish and transition refinements"
```

---

### Task 9: Verify nothing is broken

Ensure the existing app still works — editor, chat route, etc.

**Files:**
- None modified (verification only)

- [ ] **Step 1: Run TypeScript type check**

Run: `cd /Users/mg/workspace/nodetool/web && npx tsc --noEmit --pretty 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 2: Run linting**

Run: `cd /Users/mg/workspace/nodetool/web && npm run lint 2>&1 | tail -20`
Expected: No new errors

- [ ] **Step 3: Run tests**

Run: `cd /Users/mg/workspace/nodetool/web && npm test -- --watchAll=false 2>&1 | tail -30`
Expected: All existing tests pass

- [ ] **Step 4: Verify other routes**

Open the app and check:
1. `/editor` — workflow editor loads
2. `/chat` — chat view loads (this still uses `useChatService` and its own route)
3. `/dashboard` — the new Portal loads

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -u
git commit -m "fix: resolve integration issues from portal migration"
```
