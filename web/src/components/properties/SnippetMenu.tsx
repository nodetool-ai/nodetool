/** @jsxImportSource @emotion/react */

import { css } from "@emotion/react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  InputAdornment,
  Popover,
  TextField,
} from "@mui/material";
import { Chip } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
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
    width: 420,
    maxHeight: 480,
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.vars.palette.background.paper,
    ".snippet-search": {
      padding: "8px 12px 4px",
    },
    ".snippet-categories": {
      display: "flex",
      gap: 4,
      padding: "4px 12px 8px",
      overflowX: "auto",
      "&::-webkit-scrollbar": { height: 3 },
      "&::-webkit-scrollbar-thumb": {
        background: `rgba(${theme.vars.palette.common.whiteChannel} / 0.15)`,
        borderRadius: 2,
      },
    },
    ".snippet-list": {
      flex: 1,
      overflowY: "auto",
      borderTop: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.06)`,
      "&::-webkit-scrollbar": { width: 4 },
      "&::-webkit-scrollbar-thumb": {
        background: `rgba(${theme.vars.palette.common.whiteChannel} / 0.12)`,
        borderRadius: 2,
      },
    },
    ".snippet-item": {
      padding: "8px 14px",
      cursor: "pointer",
      borderBottom: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.03)`,
      transition: "background-color 0.15s",
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`,
      },
      "&.focused": {
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
      },
    },
    ".snippet-title": {
      fontSize: "0.82rem",
      fontWeight: 600,
      color: theme.vars.palette.grey[100],
      lineHeight: 1.3,
    },
    ".snippet-desc": {
      fontSize: "0.72rem",
      color: theme.vars.palette.grey[400],
      lineHeight: 1.3,
      marginTop: 1,
    },
    ".snippet-code": {
      fontSize: "0.7rem",
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
      color: theme.vars.palette.grey[500],
      marginTop: 3,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    ".snippet-empty": {
      padding: "24px 14px",
      textAlign: "center",
      color: theme.vars.palette.grey[500],
      fontSize: "0.8rem",
    },
  });

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SnippetMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  monacoRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SnippetMenu = ({
  anchorEl,
  open,
  onClose,
  monacoRef,
}: SnippetMenuProps) => {
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<SnippetCategory | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter snippets by category + search
  const filtered = useMemo(() => {
    let results = CODE_SNIPPETS;
    if (category) {
      results = results.filter((s) => s.category === category);
    }
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

  // Insert snippet into Monaco editor
  const insertSnippet = useCallback(
    (snippet: CodeSnippet) => {
      const editor = monacoRef.current;
      if (!editor) {return;}

      const selection = editor.getSelection();
      if (selection) {
        editor.executeEdits("snippet", [
          {
            range: selection,
            text: snippet.code,
            forceMoveMarkers: true,
          },
        ]);
      } else {
        // Fallback: insert at end
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
      onClose();
    },
    [monacoRef, onClose]
  );

  // Keyboard navigation
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
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [filtered, focusedIndex, insertSnippet, onClose]
  );

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          },
        },
      }}
      TransitionProps={{
        onEntered: () => searchRef.current?.focus(),
      }}
    >
      <div css={styles(theme)} onKeyDown={handleKeyDown}>
        {/* Search */}
        <div className="snippet-search">
          <TextField
            inputRef={searchRef}
            size="small"
            fullWidth
            placeholder="Search snippets..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setFocusedIndex(0);
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ opacity: 0.5 }} />
                  </InputAdornment>
                ),
                sx: { fontSize: "0.82rem" },
              },
            }}
          />
        </div>

        {/* Category chips */}
        <div className="snippet-categories">
          <Chip
            label="All"
            size="small"
            variant={category === null ? "filled" : "outlined"}
            color={category === null ? "primary" : "default"}
            onClick={() => {
              setCategory(null);
              setFocusedIndex(0);
            }}
            sx={{ fontSize: "0.7rem", height: 24 }}
          />
          {SNIPPET_CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              size="small"
              variant={category === cat ? "filled" : "outlined"}
              color={category === cat ? "primary" : "default"}
              onClick={() => {
                setCategory(cat);
                setFocusedIndex(0);
              }}
              sx={{ fontSize: "0.7rem", height: 24, whiteSpace: "nowrap" }}
            />
          ))}
        </div>

        {/* Snippet list */}
        <div className="snippet-list">
          {filtered.length === 0 ? (
            <div className="snippet-empty">No snippets found</div>
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
                <div className="snippet-code">
                  {snippet.code.split("\n")[0]}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Popover>
  );
};

export default memo(SnippetMenu);
