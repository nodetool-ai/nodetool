/** @jsxImportSource @emotion/react */

import { css } from "@emotion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chip, InputAdornment, TextField } from "@mui/material";
import { Tooltip } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AddIcon from "@mui/icons-material/Add";
import type * as monaco from "monaco-editor";
import {
  CODE_SNIPPETS,
  SNIPPET_CATEGORIES,
  type CodeSnippet,
  type SnippetCategory,
} from "../../config/codeSnippets";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = (theme: Theme) =>
  css({
    width: "260px",
    minWidth: "220px",
    maxWidth: "320px",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    background: `linear-gradient(180deg,
      rgba(${theme.vars.palette.background.paperChannel} / 0.55) 0%,
      rgba(${theme.vars.palette.background.paperChannel} / 0.38) 100%)`,
    borderLeft: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.07)`,
    position: "relative",

    ".sidebar-header": {
      padding: "10px 12px 6px",
      borderBottom: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.06)`,
      flexShrink: 0,
    },

    ".sidebar-title": {
      fontSize: "0.7rem",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary,
      marginBottom: "8px",
      opacity: 0.7,
    },

    ".snippet-search": {
      "& .MuiInputBase-root": {
        fontSize: "0.78rem",
        backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.5)`,
      },
    },

    ".snippet-categories": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px",
      padding: "8px 12px",
      borderBottom: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.06)`,
      flexShrink: 0,
    },

    ".snippet-list": {
      flex: 1,
      overflowY: "auto",
      padding: "4px 0",
      "&::-webkit-scrollbar": { width: 4 },
      "&::-webkit-scrollbar-thumb": {
        background: `rgba(${theme.vars.palette.common.whiteChannel} / 0.12)`,
        borderRadius: 2,
      },
    },

    ".snippet-item": {
      padding: "7px 12px",
      cursor: "pointer",
      borderBottom: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.03)`,
      transition: "background 0.12s",
      position: "relative",
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.09)`,
        "& .snippet-actions": { opacity: 1 },
      },
      "&.focused": {
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.14)`,
        "& .snippet-actions": { opacity: 1 },
      },
    },

    ".snippet-title": {
      fontSize: "0.78rem",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      lineHeight: 1.3,
      paddingRight: "44px",
    },

    ".snippet-desc": {
      fontSize: "0.68rem",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.3,
      marginTop: "2px",
      opacity: 0.75,
    },

    ".snippet-preview": {
      fontSize: "0.65rem",
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
      color: `rgba(${theme.vars.palette.primary.mainChannel} / 0.7)`,
      marginTop: "4px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      opacity: 0.8,
    },

    ".snippet-actions": {
      position: "absolute",
      right: "8px",
      top: "50%",
      transform: "translateY(-50%)",
      display: "flex",
      gap: "2px",
      opacity: 0,
      transition: "opacity 0.15s",
    },

    ".snippet-action-btn": {
      padding: "3px",
      borderRadius: "5px",
      border: "none",
      background: `rgba(${theme.vars.palette.background.paperChannel} / 0.8)`,
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      transition: "all 0.15s",
      "&:hover": {
        background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.2)`,
        color: theme.vars.palette.primary.main,
      },
    },

    ".snippet-empty": {
      padding: "24px 12px",
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem",
      opacity: 0.6,
    },

    ".snippet-count": {
      padding: "4px 12px 6px",
      fontSize: "0.65rem",
      color: theme.vars.palette.text.secondary,
      opacity: 0.5,
      flexShrink: 0,
      borderTop: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.04)`,
    },
  });

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SnippetSidebarProps {
  monacoRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SnippetSidebar = ({ monacoRef, visible }: SnippetSidebarProps) => {
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<SnippetCategory | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter snippets
  const filtered = useMemo(() => {
    let results = CODE_SNIPPETS;
    if (category) {results = results.filter((s) => s.category === category);}
    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.includes(q))
      );
    }
    return results;
  }, [search, category]);

  // Reset focused index when filter changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [search, category]);

  // Insert snippet at cursor (or end of file)
  const insertSnippet = useCallback(
    (snippet: CodeSnippet) => {
      const editor = monacoRef.current;
      if (!editor) {return;}
      const selection = editor.getSelection();
      if (selection) {
        editor.executeEdits("snippet", [
          { range: selection, text: snippet.code, forceMoveMarkers: true },
        ]);
      } else {
        const model = editor.getModel();
        if (model) {
          const lastLine = model.getLineCount();
          const lastCol = model.getLineMaxColumn(lastLine);
          editor.executeEdits("snippet", [
            {
              range: {
                startLineNumber: lastLine,
                startColumn: lastCol,
                endLineNumber: lastLine,
                endColumn: lastCol,
              },
              text: "\n" + snippet.code,
              forceMoveMarkers: true,
            },
          ]);
        }
      }
      editor.focus();
    },
    [monacoRef]
  );

  // Copy snippet to clipboard
  const copySnippet = useCallback(async (snippet: CodeSnippet) => {
    await navigator.clipboard.writeText(snippet.code);
    setCopied(snippet.id);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  // Keyboard nav on the list
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        insertSnippet(filtered[focusedIndex]);
      }
    },
    [filtered, focusedIndex, insertSnippet]
  );

  if (!visible) {return null;}

  return (
    <div css={styles(theme)} onKeyDown={handleKeyDown}>
      <div className="sidebar-header">
        <div className="sidebar-title">Snippets</div>
        <TextField
          inputRef={searchRef}
          className="snippet-search"
          size="small"
          fullWidth
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ opacity: 0.4, fontSize: "0.9rem" }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            "& .MuiInputBase-input": { fontSize: "0.78rem", padding: "5px 8px" },
          }}
        />
      </div>

      {/* Category filters */}
      <div className="snippet-categories">
        <Chip
          label="All"
          size="small"
          variant={category === null ? "filled" : "outlined"}
          color={category === null ? "primary" : "default"}
          onClick={() => setCategory(null)}
          sx={{ fontSize: "0.62rem", height: 20 }}
        />
        {SNIPPET_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            size="small"
            variant={category === cat ? "filled" : "outlined"}
            color={category === cat ? "primary" : "default"}
            onClick={() => setCategory(cat)}
            sx={{ fontSize: "0.62rem", height: 20, whiteSpace: "nowrap" }}
          />
        ))}
      </div>

      {/* List */}
      <div className="snippet-list" ref={listRef}>
        {filtered.length === 0 ? (
          <div className="snippet-empty">No snippets match</div>
        ) : (
          filtered.map((snippet, index) => (
            <div
              key={snippet.id}
              className={`snippet-item ${index === focusedIndex ? "focused" : ""}`}
              onClick={() => insertSnippet(snippet)}
              onMouseEnter={() => setFocusedIndex(index)}
            >
              <div className="snippet-title">{snippet.title}</div>
              <div className="snippet-desc">{snippet.description}</div>
              <div className="snippet-preview">
                {snippet.code.split("\n")[0].trim()}
              </div>
              <div className="snippet-actions">
                <Tooltip title="Copy" placement="left" delay={400}>
                  <button
                    className="snippet-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void copySnippet(snippet);
                    }}
                  >
                    <ContentCopyIcon
                      sx={{ fontSize: "0.75rem", color: copied === snippet.id ? "success.main" : undefined }}
                    />
                  </button>
                </Tooltip>
                <Tooltip title="Insert" placement="left" delay={400}>
                  <button
                    className="snippet-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      insertSnippet(snippet);
                    }}
                  >
                    <AddIcon sx={{ fontSize: "0.75rem" }} />
                  </button>
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="snippet-count">
        {filtered.length} snippet{filtered.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
};

export default memo(SnippetSidebar);
