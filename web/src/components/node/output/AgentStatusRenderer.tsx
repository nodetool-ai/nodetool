/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTheme, type Theme } from "@mui/material/styles";
import {
  AutoAwesome as PlanIcon,
  Assignment as TaskIcon,
  Build as ToolIcon,
  Info as LogIcon,
  Warning as WarningIcon,
  ErrorOutline as ErrorIcon
} from "@mui/icons-material";
import { Chunk } from "../../../stores/ApiTypes";

type Props = {
  chunk: Chunk;
};

type Kind = "planning" | "task" | "tool_call" | "log";

const palette = (
  theme: Theme,
  kind: Kind,
  severity: string
) => {
  const v = theme.vars?.palette ?? theme.palette;
  if (severity === "error") return v.error.main;
  if (severity === "warning") return v.warning.main;
  switch (kind) {
    case "planning":
      return v.info.main;
    case "task":
      return v.success.main;
    case "tool_call":
      return v.primary.main;
    case "log":
    default:
      return v.text.secondary;
  }
};

const labelFor = (kind: Kind, meta: Record<string, unknown>): string => {
  switch (kind) {
    case "planning":
      return String(meta.phase ?? "planning");
    case "task":
      return String(meta.event ?? "task");
    case "tool_call":
      return String(meta.name ?? "tool");
    case "log":
    default:
      return "log";
  }
};

const IconFor: React.FC<{ kind: Kind; severity: string }> = ({
  kind,
  severity
}) => {
  if (severity === "error") return <ErrorIcon fontSize="inherit" />;
  if (severity === "warning") return <WarningIcon fontSize="inherit" />;
  switch (kind) {
    case "planning":
      return <PlanIcon fontSize="inherit" />;
    case "task":
      return <TaskIcon fontSize="inherit" />;
    case "tool_call":
      return <ToolIcon fontSize="inherit" />;
    case "log":
    default:
      return <LogIcon fontSize="inherit" />;
  }
};

export const AgentStatusRenderer: React.FC<Props> = memo(({ chunk }) => {
  const theme = useTheme() as Theme;
  const meta = (chunk.content_metadata ?? {}) as Record<string, unknown>;
  const kind = ((meta.kind as Kind) ?? "log") as Kind;
  const severity = String(meta.severity ?? "info");
  const color = palette(theme, kind, severity);
  const label = labelFor(kind, meta);
  const text = (chunk.content as string) ?? "";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "6px 12px",
        margin: "2px 8px",
        borderLeft: `2px solid ${color}`,
        background: `${color}14`,
        borderRadius: "var(--rounded-sm)",
        fontSize: "0.82em",
        lineHeight: 1.4,
        color: theme.vars?.palette.text.primary ?? theme.palette.text.primary
      }}
    >
      <span
        style={{
          color,
          display: "inline-flex",
          alignItems: "center",
          fontSize: "1em",
          marginTop: 1
        }}
      >
        <IconFor kind={kind} severity={severity} />
      </span>
      <span
        style={{
          color,
          fontWeight: 600,
          textTransform: "uppercase",
          fontSize: "0.7em",
          letterSpacing: 0.5,
          flexShrink: 0,
          paddingTop: 2
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          fontFamily: theme.fontFamily2 ?? undefined,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        }}
      >
        {text}
      </span>
    </div>
  );
});

AgentStatusRenderer.displayName = "AgentStatusRenderer";
