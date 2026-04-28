/** @jsxImportSource @emotion/react */
import React, { memo, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import DOMPurify from "dompurify";
import type { Chunk } from "../../../stores/ApiTypes";

type Props = {
  chunk: Chunk;
};

const toolCallStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      gap: ".25em",
      padding: ".4em .6em",
      margin: ".2em 0",
      borderRadius: "var(--rounded-sm)",
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[900],
      fontFamily: theme.fontFamily2,
      fontSize: theme.vars.fontSizeSmaller,
      lineHeight: 1.4,
      width: "100%",
      boxSizing: "border-box"
    },
    ".header": {
      display: "flex",
      alignItems: "baseline",
      gap: ".5em",
      cursor: "pointer",
      userSelect: "none"
    },
    ".badge": {
      flexShrink: 0,
      padding: "0 .4em",
      borderRadius: "var(--rounded-xs)",
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      fontSize: "0.65rem",
      fontWeight: 600,
      letterSpacing: "0.05em",
      textTransform: "uppercase"
    },
    ".name": {
      fontWeight: 600,
      color: theme.vars.palette.grey[100],
      wordBreak: "break-all"
    },
    ".id": {
      marginLeft: "auto",
      color: theme.vars.palette.grey[500],
      fontSize: "0.7rem",
      flexShrink: 0
    },
    ".caret": {
      color: theme.vars.palette.grey[400],
      transition: "transform 120ms ease",
      flexShrink: 0
    },
    ".caret.open": {
      transform: "rotate(90deg)"
    },
    ".args": {
      margin: 0,
      padding: ".4em .5em",
      borderRadius: "var(--rounded-xs)",
      backgroundColor: theme.vars.palette.background.default,
      color: theme.vars.palette.grey[100],
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflowX: "auto"
    },
    ".token.property": { color: "#9cdcfe" },
    ".token.string": { color: "#ce9178" },
    ".token.number": { color: "#b5cea8" },
    ".token.boolean": { color: "#569cd6" },
    ".token.null": { color: "#569cd6" },
    ".token.punctuation": { color: "#d4d4d4" }
  });

const stringifyArgs = (args: unknown): string => {
  try {
    return JSON.stringify(args ?? {}, null, 2);
  } catch {
    return String(args);
  }
};

const summarizeArgs = (args: unknown): string => {
  if (!args || typeof args !== "object") return "";
  const keys = Object.keys(args as Record<string, unknown>);
  if (keys.length === 0) return "()";
  if (keys.length <= 3) return `(${keys.join(", ")})`;
  return `(${keys.slice(0, 3).join(", ")}, +${keys.length - 3})`;
};

export const ToolCallRenderer: React.FC<Props> = memo(({ chunk }) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const meta = chunk.content_metadata ?? {};
  const toolName =
    typeof meta.tool_name === "string"
      ? meta.tool_name
      : typeof chunk.content === "string"
        ? chunk.content.split("(")[0] || "tool"
        : "tool";
  const toolCallId =
    typeof meta.tool_call_id === "string" ? meta.tool_call_id : "";
  const args = "args" in meta ? meta.args : undefined;

  const argsJson = useMemo(() => stringifyArgs(args), [args]);
  const highlightedArgs = useMemo(() => {
    try {
      const html = Prism.highlight(argsJson, Prism.languages.json, "json");
      return DOMPurify.sanitize(html);
    } catch {
      return DOMPurify.sanitize(argsJson);
    }
  }, [argsJson]);

  return (
    <div css={toolCallStyles(theme)} className="tool-call">
      <div
        className="header"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <span className="badge">tool</span>
        <span className="name">{toolName}</span>
        {!open && (
          <span style={{ color: theme.vars.palette.grey[400] }}>
            {summarizeArgs(args)}
          </span>
        )}
        {toolCallId && (
          <span className="id" title={toolCallId}>
            {toolCallId.length > 12 ? `${toolCallId.slice(0, 8)}…` : toolCallId}
          </span>
        )}
        <span className={`caret${open ? " open" : ""}`}>›</span>
      </div>
      {open && (
        <pre
          className="args"
          dangerouslySetInnerHTML={{ __html: highlightedArgs }}
        />
      )}
    </div>
  );
});

ToolCallRenderer.displayName = "ToolCallRenderer";
