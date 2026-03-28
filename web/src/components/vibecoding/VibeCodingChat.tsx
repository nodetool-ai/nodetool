import React, { useCallback, useMemo, useEffect, memo, useState, useRef } from "react";
import {
  Box,
  Typography,
  Chip,
  Select,
  MenuItem,
  CircularProgress,
  Paper,
  MenuList
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { Message } from "../../stores/ApiTypes";
import type { Workflow, WorkspaceResponse } from "../../stores/ApiTypes";
import useAgentStore from "../../stores/AgentStore";
import ChatView from "../chat/containers/ChatView";
import { useVibecodingTemplates, Template } from "../../hooks/useVibecodingTemplates";
import { client } from "../../stores/ApiClient";
import { useWorkflow } from "../../serverState/useWorkflow";

const BASE_SYSTEM_PROMPT = `You are a VibeCoding assistant inside NodeTool.
You build polished Next.js applications that integrate with NodeTool workflows.

## Environment

- The workspace is a Next.js 15 project (App Router) with TypeScript and Tailwind CSS v4.
- A dev server is already running and managed externally — DO NOT run \`npm run dev\`, \`npm start\`, or any server start commands.
- The user sees a live preview iframe that auto-reloads when you save files (Next.js Fast Refresh).
- Your working directory is the workspace root.

## Dev Server Management

The dev server is managed externally. You have MCP tools to interact with it:

- \`devserver_status\` — Check if the server is running, its port, and health status.
- \`devserver_logs\` — Read recent server output. Use this to diagnose build errors or compilation failures.
- \`devserver_restart\` — Restart the server. Use after installing npm packages or if the preview is broken.

### Rules
- DO NOT run \`npm run dev\`, \`npm start\`, \`next dev\`, or any server start commands in Bash.
- DO NOT claim "the app is now running" or "the server is started" — you don't start it.
- Use \`devserver_logs\` to check for build errors after making changes.
- Use \`devserver_restart\` after \`npm install\` or if the preview stops working.
- Use \`devserver_status\` to verify the server is healthy before telling the user things are ready.

## Steps

1. Read the workspace source files to understand what exists (start with src/app/page.tsx, package.json).
2. Edit or create files to implement the user's request.
3. Use only standard Next.js App Router conventions (app/ directory, page.tsx, layout.tsx, etc.).
4. Write complete, working code — files are saved and the preview updates automatically via Fast Refresh.
5. You may install npm packages if needed using Bash (npm install <pkg>). The server will auto-restart after install.

## Design System

Build dark-themed, polished UIs with these patterns:

### Layout
- Centered container: \`max-w-[640px] mx-auto px-6 pb-16 pt-8 min-h-screen flex flex-col\`
- Use \`'use client'\` for interactive pages

### Multi-Step Wizard Pattern
Use a step-based UI: Input → Loading → Results
\`\`\`tsx
const [step, setStep] = useState<1 | 2 | 3>(1);
// Step 1: Form with inputs, sample chips, submit button
// Step 2: Animated loading spinner with workflow visualization
// Step 3: Results with styled cards
\`\`\`

### Component Patterns (use shadcn/ui)
Install with: \`npx shadcn@latest add button card badge alert textarea\`
Utility: \`src/lib/utils.ts\` with \`cn()\` from clsx + tailwind-merge.

### Dark Theme Colors (OKLCH)
Always add \`class="dark"\` to the \`<html>\` element in \`src/app/layout.tsx\` so the dark CSS variables activate:
\`\`\`tsx
<html lang="en" className="dark">
\`\`\`

Use these CSS variables in globals.css:
\`\`\`css
.dark {
  --background: oklch(0.09 0.005 270);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.13 0.008 270);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --muted: oklch(0.18 0.01 270);
  --border: oklch(1 0 0 / 8%);
}
body {
  background: linear-gradient(180deg, oklch(0.09 0.01 270) 0%, oklch(0.07 0.005 280) 100%);
}
\`\`\`

### Styling Patterns
- Gradient buttons: \`bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-semibold shadow-[0_0_20px_-4px_rgba(99,102,241,0.4)]\`
- Gradient top borders: \`<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />\`
- Glow effects: \`shadow-[0_0_15px_-3px_rgba(99,102,241,0.3)]\`
- Loading spinner (dual rings):
  \`\`\`html
  <div className="relative w-16 h-16">
    <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
    <div className="absolute inset-3 rounded-full border-2 border-transparent border-t-violet-500 animate-spin [animation-direction:reverse] [animation-duration:1.5s]" />
  </div>
  \`\`\`
- Result cards with color-coded severity: red (critical), orange (high), yellow (medium), green (low/success)
- Sample chips with Badge: \`<Badge variant="outline" className="cursor-pointer hover:bg-indigo-500/5">\`

### Step Indicator
\`\`\`tsx
function StepIndicator({ current, steps }: { current: number; steps: { num: number; label: string }[] }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((s, i) => {
        const isActive = s.num === current;
        const isDone = s.num < current;
        return (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={\`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all \${
                isActive ? "bg-indigo-500 text-white shadow-[0_0_20px_-3px_rgba(99,102,241,0.5)]"
                : isDone ? "bg-green-500/20 text-green-400 border border-green-500/50"
                : "bg-muted text-slate-500 border border-border"
              }\`}>
                {isDone ? "✓" : s.num}
              </div>
              <span className={\`text-[0.65rem] font-semibold uppercase tracking-wider \${
                isActive ? "text-indigo-300" : isDone ? "text-green-400" : "text-slate-600"
              }\`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={\`w-16 h-px mx-3 mb-5 \${isDone ? "bg-green-500/50" : "bg-border"}\`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
\`\`\`

### Media Output Rendering
- Images: \`<img src={url} className="rounded-lg max-w-full" />\`
- Audio: \`<audio controls src={url} className="w-full" />\`
- Video: \`<video controls src={url} className="rounded-lg max-w-full" />\`
- Text: formatted in a card with \`whitespace-pre-wrap\`

## Guidelines
- Tailwind CSS for all styling — no CSS modules or styled-components
- Keep code simple, clean, and self-contained
- Always produce valid TypeScript/TSX
- Do not modify next.config.*, tsconfig.json, or tailwind.config.* unless explicitly asked
- After making edits, give a SHORT summary (1-2 sentences) of what changed — no feature lists, no emoji headers, no marketing copy
- Never claim you started a server or that the app is "now running" — you only edit files`;

/** Build the workflow section of the system prompt. */
function buildWorkflowContext(workflow: Workflow): string {
  const lines: string[] = [
    "",
    "## Referenced NodeTool Workflow",
    "",
    "The user has selected a NodeTool workflow to build this app around.",
    "Build a polished Next.js frontend for this workflow following the demo app patterns.",
    "",
    `**Name:** ${workflow.name}`,
    `**ID:** ${workflow.id}`,
  ];

  if (workflow.description) {
    lines.push(`**Description:** ${workflow.description}`);
  }

  if (workflow.input_schema) {
    lines.push("", "**Input Schema:**", "```json", JSON.stringify(workflow.input_schema, null, 2), "```");
  }

  if (workflow.output_schema) {
    lines.push("", "**Output Schema:**", "```json", JSON.stringify(workflow.output_schema, null, 2), "```");
  }

  lines.push(
    "",
    "## Workflow Integration Pattern",
    "",
    "Call the NodeTool API at `http://localhost:8000` to run the workflow.",
    "",
    "**Create a Next.js API route** (e.g. `src/app/api/run-workflow/route.ts`):",
    "```typescript",
    'import { NextRequest, NextResponse } from "next/server";',
    "",
    "export async function POST(request: NextRequest) {",
    "  const { params } = await request.json();",
    `  const res = await fetch("http://localhost:8000/api/workflows/${workflow.id}/run", {`,
    '    method: "POST",',
    '    headers: { "Content-Type": "application/json" },',
    "    body: JSON.stringify({ params }),",
    "  });",
    "  if (!res.ok) {",
    '    const err = await res.json();',
    '    return NextResponse.json({ error: err.detail ?? "Workflow failed" }, { status: 500 });',
    "  }",
    "  return NextResponse.json(await res.json());",
    "}",
    "```",
    "",
    "**Call it from the client:**",
    "```typescript",
    'const res = await fetch("/api/run-workflow", {',
    '  method: "POST",',
    '  headers: { "Content-Type": "application/json" },',
    "  body: JSON.stringify({ params: { /* input params matching input_schema */ } }),",
    "});",
    "const result = await res.json();",
    "// result contains the workflow outputs",
    "```",
    "",
    "## UI Pattern (follow the demo)",
    "",
    "Build a multi-step wizard:",
    "1. **Input step** — Form with inputs matching the workflow's input_schema, sample data chips, submit button",
    "2. **Loading step** — Animated spinner with workflow visualization showing what's running",
    "3. **Result step** — Display outputs with appropriate styling (images as <img>, text formatted, etc.)",
    "",
    "Use the demo's component patterns: Card, Badge, Button with gradient styling, StepIndicator, etc.",
    "Render media outputs appropriately: images as <img>, audio as <audio>, video as <video>.",
  );

  return lines.join("\n");
}

interface WorkflowOption {
  id: string;
  name: string;
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
  const status = useAgentStore((s) => s.status);
  const messages = useAgentStore((s) => s.messages);
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const stopGeneration = useAgentStore((s) => s.stopGeneration);
  const setWorkspaceContext = useAgentStore((s) => s.setWorkspaceContext);
  const isAvailable = useAgentStore((s) => s.isAvailable);

  const { templates } = useVibecodingTemplates();

  // @mention dropdown state
  const containerRef = useRef<HTMLDivElement>(null);
  const [mentionState, setMentionState] = useState<{
    active: boolean;
    anchorEl: HTMLElement | null;
    search: string;
    atIndex: number;
  }>({ active: false, anchorEl: null, search: "", atIndex: -1 });

  // Workflow selection state
  const [workflowOptions, setWorkflowOptions] = useState<WorkflowOption[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const { data: selectedWorkflow } = useWorkflow(selectedWorkflowId);

  // Fetch workflow list on mount
  useEffect(() => {
    let cancelled = false;
    const fetchWorkflows = async () => {
      setWorkflowsLoading(true);
      try {
        const { data } = await client.GET("/api/workflows/", {
          params: { query: { limit: 100 } }
        });
        if (!cancelled && data) {
          setWorkflowOptions(
            (data as { workflows: WorkflowOption[] }).workflows.map((w) => ({
              id: w.id,
              name: w.name
            }))
          );
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {setWorkflowsLoading(false);}
      }
    };
    fetchWorkflows();
    return () => { cancelled = true; };
  }, []);

  // Build system prompt with optional workflow context
  const systemPrompt = useMemo(() => {
    if (selectedWorkflow) {
      return BASE_SYSTEM_PROMPT + "\n" + buildWorkflowContext(selectedWorkflow);
    }
    return BASE_SYSTEM_PROMPT;
  }, [selectedWorkflow]);

  // Keep the agent store's workspace context in sync with VibeCoding prompt
  useEffect(() => {
    if (workspaceId && workspacePath) {
      setWorkspaceContext(workspaceId, workspacePath, {
        systemPrompt,
        useStandardTools: true
      });
    }
  }, [workspaceId, workspacePath, systemPrompt, setWorkspaceContext]);

  // Reset to defaults when leaving VibeCoding (unmount only)
  useEffect(() => {
    return () => {
      useAgentStore.getState().setWorkspaceContext(null, null, {
        systemPrompt: null,
        useStandardTools: false
      });
    };
  }, []);

  // Detect @mention in the chat textarea
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let textarea: HTMLTextAreaElement | null = null;

    const handleInput = (e: Event) => {
      const ta = e.target as HTMLTextAreaElement;
      const cursor = ta.selectionStart ?? 0;
      const textBefore = ta.value.slice(0, cursor);
      const match = textBefore.match(/@(\w*)$/);
      if (match) {
        setMentionState({
          active: true,
          anchorEl: ta,
          search: match[1].toLowerCase(),
          atIndex: cursor - match[0].length
        });
      } else {
        setMentionState({ active: false, anchorEl: null, search: "", atIndex: -1 });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMentionState({ active: false, anchorEl: null, search: "", atIndex: -1 });
      }
    };

    const attachListeners = () => {
      textarea = container.querySelector("textarea");
      if (textarea) {
        textarea.addEventListener("input", handleInput);
        textarea.addEventListener("keydown", handleKeyDown);
      } else {
        requestAnimationFrame(attachListeners);
      }
    };
    attachListeners();

    return () => {
      textarea?.removeEventListener("input", handleInput);
      textarea?.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const filteredWorkflows = useMemo(
    () =>
      workflowOptions.filter((w) =>
        w.name.toLowerCase().includes(mentionState.search)
      ),
    [workflowOptions, mentionState.search]
  );

  const handleWorkflowMentionSelect = useCallback(
    (workflow: WorkflowOption) => {
      setSelectedWorkflowId(workflow.id);
      const container = containerRef.current;
      const captured = mentionState;
      setMentionState({ active: false, anchorEl: null, search: "", atIndex: -1 });

      if (!container) return;
      const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
      if (!textarea) return;

      const cursorEnd = captured.atIndex + 1 + captured.search.length;
      const newValue =
        textarea.value.slice(0, captured.atIndex) +
        `@${workflow.name} ` +
        textarea.value.slice(cursorEnd);

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(textarea, newValue);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
    },
    [mentionState]
  );

  const handleWorkspaceSelect = useCallback(
    (event: SelectChangeEvent<string>) => {
      onWorkspaceChange(event.target.value);
    },
    [onWorkspaceChange]
  );

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (!workspaceId || !workspacePath) {return;}
      await sendMessage(message);
    },
    [workspaceId, workspacePath, sendMessage]
  );

  const handleStop = useCallback(() => {
    stopGeneration();
  }, [stopGeneration]);

  const handleTemplateClick = useCallback(
    (template: Template) => {
      void handleSendMessage({
        type: "message",
        name: "",
        role: "user",
        content: [{ type: "text", text: template.prompt }],
        created_at: new Date().toISOString()
      });
    },
    [handleSendMessage]
  );

  const createTemplateClickHandler = useCallback(
    (template: Template) => () => handleTemplateClick(template),
    [handleTemplateClick]
  );

  const chatStatus = useMemo(() => {
    if (status === "streaming" || status === "loading") {return "streaming";}
    if (status === "error") {return "error";}
    return "connected";
  }, [status]);

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
          {!isAvailable
            ? "Desktop App Required"
            : workspaceId
              ? "Design Your App"
              : "Select a Workspace"}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 400 }}
        >
          {!isAvailable
            ? "The Claude agent requires the NodeTool desktop app (Electron)."
            : workspaceId
              ? "Describe your UI. Type @ to link a workflow."
              : "Pick a workspace from the dropdown above to start building."}
        </Typography>
      </Box>
    ),
    [workspaceId, isAvailable]
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

      {/* Linked workflow chip */}
      {selectedWorkflow && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 0.75,
            borderBottom: (theme) => `1px solid ${theme.palette.divider}`
          }}
        >
          <Chip
            label={selectedWorkflow.name}
            size="small"
            icon={<AccountTreeIcon />}
            onDelete={() => setSelectedWorkflowId(null)}
            color="primary"
            variant="outlined"
          />
        </Box>
      )}

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
      <Box ref={containerRef} sx={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <ChatView
          status={chatStatus}
          progress={0}
          total={100}
          messages={messages}
          sendMessage={handleSendMessage}
          onStop={handleStop}
          showToolbar={false}
          noMessagesPlaceholder={welcomePlaceholder}
          progressMessage={null}
        />

        {/* @-mention workflow picker */}
        {mentionState.active && (filteredWorkflows.length > 0 || workflowsLoading) && (
          <Box
            sx={{
              position: "absolute",
              bottom: 60,
              left: 8,
              zIndex: 1500
            }}
          >
            <Paper
              elevation={6}
              sx={{ minWidth: 220, maxWidth: 320, maxHeight: 220, overflow: "auto" }}
            >
              <MenuList dense disablePadding>
                {workflowsLoading ? (
                  <MenuItem disabled sx={{ fontSize: "0.8rem" }}>
                    <CircularProgress size={12} sx={{ mr: 1 }} /> Loading…
                  </MenuItem>
                ) : (
                  filteredWorkflows.map((w) => (
                    <MenuItem
                      key={w.id}
                      onClick={() => handleWorkflowMentionSelect(w)}
                      sx={{ fontSize: "0.8rem", gap: 1 }}
                    >
                      <AccountTreeIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                      {w.name}
                    </MenuItem>
                  ))
                )}
              </MenuList>
            </Paper>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default memo(VibeCodingChat);
