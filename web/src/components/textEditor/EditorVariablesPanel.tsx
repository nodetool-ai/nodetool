/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type React from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import DataObjectIcon from "@mui/icons-material/DataObject";
import { Tooltip, MOTION, BORDER_RADIUS } from "../ui_primitives";
import type { TemplateVariable, VariableSyntax } from "./templateVariables";

interface EditorVariablesPanelProps {
  variables: TemplateVariable[];
  /** Preview values keyed by variable name (not persisted to the graph). */
  values: Record<string, string>;
  onSetValue: (name: string, value: string) => void;
  /** Insert a `{{ name }}` token into the editor at the cursor. */
  onInsert: (name: string, syntax: VariableSyntax) => void;
  /**
   * Changes to this number pop open the inline "add variable" input — wired to
   * the toolbar's "Insert var" button.
   */
  addSignal: number;
  readOnly?: boolean;
}

const styles = (theme: Theme) =>
  css({
    flexShrink: 0,
    maxHeight: "30%",
    overflowY: "auto",
    padding: "0.55em 1.25em 0.7em",
    backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.45)`,
    borderTop: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.05)`,
    ".variables-head": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5em",
      marginBottom: "0.45em"
    },
    ".variables-title": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      fontSize: "var(--fontSizeSmaller)",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary,
      svg: { fontSize: "var(--fontSizeNormal)", opacity: 0.7 },
      ".count": {
        color: theme.vars.palette.text.primary,
        fontWeight: 600
      },
      ".unbound": {
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35em",
        color: theme.vars.palette.warning.main,
        fontWeight: 500,
        "&::before": {
          content: "''",
          width: "5px",
          height: "5px",
          borderRadius: BORDER_RADIUS.circle,
          backgroundColor: theme.vars.palette.warning.main
        }
      }
    },
    ".variables-hint": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      fontFamily: theme.fontFamily2,
      whiteSpace: "nowrap"
    },
    ".variables-chips": {
      display: "flex",
      flexWrap: "wrap",
      gap: "0.5em",
      alignItems: "center"
    },
    ".variable-chip": {
      display: "inline-flex",
      alignItems: "center",
      gap: "0.55em",
      padding: "0.3em 0.7em",
      borderRadius: BORDER_RADIUS.lg,
      cursor: "pointer",
      backgroundColor: `rgba(${theme.vars.palette.background.paperChannel} / 0.55)`,
      border: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.06)`,
      transition: `all ${MOTION.fast}`,
      "&:hover": {
        borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`,
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`
      },
      ".chip-dot": {
        width: "7px",
        height: "7px",
        borderRadius: BORDER_RADIUS.circle,
        flexShrink: 0,
        backgroundColor: theme.vars.palette.success.main,
        boxShadow: `0 0 6px rgba(${theme.vars.palette.success.mainChannel} / 0.5)`
      },
      "&.unset .chip-dot": {
        backgroundColor: "transparent",
        boxShadow: "none",
        border: `1.5px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.3)`
      },
      ".chip-name": {
        fontFamily: theme.fontFamily2,
        fontSize: "var(--fontSizeSmall)",
        fontWeight: 600,
        color: theme.vars.palette.text.primary
      },
      ".chip-value": {
        fontFamily: theme.fontFamily2,
        fontSize: "var(--fontSizeSmall)",
        color: theme.vars.palette.text.secondary,
        maxWidth: "140px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      "&.unset .chip-value": {
        color: theme.vars.palette.text.disabled,
        fontStyle: "italic"
      },
      ".chip-input": {
        fontFamily: theme.fontFamily2,
        fontSize: "var(--fontSizeSmall)",
        color: theme.vars.palette.text.primary,
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${theme.vars.palette.primary.main}`,
        outline: "none",
        width: "120px",
        padding: 0
      }
    },
    ".variable-add": {
      display: "inline-flex",
      alignItems: "center",
      gap: "0.35em",
      padding: "0.3em 0.7em",
      borderRadius: BORDER_RADIUS.lg,
      cursor: "pointer",
      color: theme.vars.palette.text.secondary,
      background: "transparent",
      border: `1px dashed rgba(${theme.vars.palette.common.whiteChannel} / 0.18)`,
      fontSize: "var(--fontSizeSmall)",
      transition: `all ${MOTION.fast}`,
      "&:hover": {
        color: theme.vars.palette.primary.main,
        borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.6)`
      },
      svg: { fontSize: "var(--fontSizeNormal)" },
      ".add-input": {
        fontFamily: theme.fontFamily2,
        fontSize: "var(--fontSizeSmall)",
        color: theme.vars.palette.text.primary,
        background: "transparent",
        border: "none",
        outline: "none",
        width: "110px",
        padding: 0
      }
    }
  });

const EditorVariablesPanel = ({
  variables,
  values,
  onSetValue,
  onInsert,
  addSignal,
  readOnly = false
}: EditorVariablesPanelProps) => {
  const theme = useTheme();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const unboundCount = useMemo(
    () => variables.filter((v) => !(values[v.name] ?? "").trim()).length,
    [variables, values]
  );

  // "Insert var" toolbar button bumps addSignal — open the inline add input.
  useEffect(() => {
    if (addSignal > 0 && !readOnly) {
      setAddOpen(true);
    }
  }, [addSignal, readOnly]);

  useEffect(() => {
    if (addOpen) {
      addInputRef.current?.focus();
    }
  }, [addOpen]);

  const beginEdit = useCallback(
    (name: string) => {
      setEditingName(name);
      setDraftValue(values[name] ?? "");
    },
    [values]
  );

  const commitEdit = useCallback(() => {
    if (editingName !== null) {
      onSetValue(editingName, draftValue);
      setEditingName(null);
    }
  }, [editingName, draftValue, onSetValue]);

  const handleChipClick = useCallback(
    (e: React.MouseEvent, name: string, syntax: VariableSyntax) => {
      if (e.metaKey || e.ctrlKey) {
        onInsert(name, syntax);
        return;
      }
      if (!readOnly) {
        beginEdit(name);
      }
    },
    [onInsert, beginEdit, readOnly]
  );

  const commitAdd = useCallback(() => {
    const name = addName.trim();
    if (name) {
      onInsert(name, "double");
    }
    setAddName("");
    setAddOpen(false);
  }, [addName, onInsert]);

  return (
    <div className="editor-variables-panel" css={styles(theme)}>
      <div className="variables-head">
        <div className="variables-title">
          <DataObjectIcon />
          <span>Variables</span>
          <span className="count">{variables.length}</span>
          {unboundCount > 0 && (
            <span className="unbound">{unboundCount} unbound</span>
          )}
        </div>
        <span className="variables-hint">⌘ + click to insert</span>
      </div>
      <div className="variables-chips">
        {variables.map((variable) => {
          const value = values[variable.name] ?? "";
          const isUnset = !value.trim();
          const isEditing = editingName === variable.name;
          return (
            <Tooltip
              key={variable.name}
              title={`Click to set a value · ⌘+click to insert ${variable.name}`}
            >
              <div
                className={`variable-chip ${isUnset && !isEditing ? "unset" : ""}`}
                role="button"
                tabIndex={0}
                onClick={(e) =>
                  handleChipClick(e, variable.name, variable.syntax)
                }
              >
                <span className="chip-dot" />
                <span className="chip-name">{variable.name}</span>
                {isEditing ? (
                  <input
                    className="chip-input"
                    autoFocus
                    value={draftValue}
                    placeholder="value"
                    onChange={(e) => setDraftValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        commitEdit();
                      } else if (e.key === "Escape") {
                        setEditingName(null);
                      }
                    }}
                  />
                ) : (
                  <span className="chip-value">{isUnset ? "unset" : value}</span>
                )}
              </div>
            </Tooltip>
          );
        })}
        {!readOnly &&
          (addOpen ? (
            <div className="variable-add">
              <input
                ref={addInputRef}
                className="add-input"
                value={addName}
                placeholder="variable name"
                onChange={(e) =>
                  setAddName(e.target.value.replace(/[^\w]/g, ""))
                }
                onBlur={commitAdd}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitAdd();
                  } else if (e.key === "Escape") {
                    setAddName("");
                    setAddOpen(false);
                  }
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className="variable-add"
              onClick={() => setAddOpen(true)}
            >
              <AddIcon />
              Add
            </button>
          ))}
      </div>
    </div>
  );
};

export default memo(EditorVariablesPanel);
