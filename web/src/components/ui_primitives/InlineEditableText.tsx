/**
 * InlineEditableText
 *
 * Rename-in-place control: a display element that swaps for a transparent
 * input while `editing` is true. Replaces a dozen hand-rolled copies that each
 * carried a different subset of the same fixes:
 *
 * - a blur arriving after the input already left edit mode must not commit a
 *   stale draft (was only in TrackHeader);
 * - Escape must cancel, and the blur it triggers must not commit
 *   (was only in WorkspaceTabItem);
 * - commit trims, and skips empty or unchanged values
 *   (was only in WorkflowListItem).
 *
 * `editing` is controlled — the parent owns "which row is being renamed" — and
 * the draft lives here.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ElementType,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from "react";
import type { SxProps, Theme } from "@mui/material/styles";

import { Box } from "./Box";
import { BORDER_RADIUS } from "./tokens";
import { SPACING, getSpacingPx } from "./spacing";

export interface InlineEditableTextProps {
  /** The committed text. Seeds the draft each time editing starts. */
  value: string;
  /** Controlled edit state — the parent decides which element is editable. */
  editing: boolean;
  /** Called with false on commit or cancel, and with true on double-click. */
  onEditingChange: (editing: boolean) => void;
  /** Fired only for a trimmed, non-empty, changed value. */
  onCommit: (next: string) => void;
  /** Fired on Escape, after edit mode is left. */
  onCancel?: () => void;
  /** Select the whole draft when the input takes focus. */
  selectOnFocus?: boolean;
  /** Render a textarea; plain Enter inserts a newline, Cmd/Ctrl+Enter commits. */
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  /** Accessible name for the input — required, these controls have no label. */
  ariaLabel: string;
  /** Element for the default display node. */
  as?: ElementType;
  /**
   * Keep one input element in both states — read-only at rest, editable while
   * `editing`. For layouts whose resting name is already drawn as an input;
   * the DOM node survives the transition instead of being swapped out.
   */
  displayAsInput?: boolean;
  /** `title` for the resting display node only. */
  title?: string;
  /** Skip the primitive's own input styling; the caller supplies all of it. */
  unstyled?: boolean;
  /**
   * Allow committing an empty value (a clear). Off by default: an emptied
   * rename field is a mistake, not an instruction.
   */
  allowEmpty?: boolean;
  /** Rewrite each keystroke, e.g. to strip characters an identifier can't hold. */
  sanitize?: (raw: string) => string;
  /** Mirror the draft upward for call sites whose parent still holds it. */
  onDraftChange?: (draft: string) => void;
  /** Stop click/keydown escaping to a clickable row behind the input. */
  stopPropagation?: boolean;
  /** Applied to the input. */
  className?: string;
  /** Applied to the input. */
  sx?: SxProps<Theme>;
  /** Applied to the default display node. */
  displayClassName?: string;
  /** Applied to the default display node. */
  displaySx?: SxProps<Theme>;
  /** Replaces the default display node entirely; ignored while editing. */
  children?: ReactNode;
}

const inputBaseSx: SxProps<Theme> = {
  background: "transparent",
  border: "none",
  outline: "none",
  color: "inherit",
  font: "inherit",
  minWidth: 0,
  padding: `0 ${getSpacingPx(SPACING.micro)}`,
  borderRadius: BORDER_RADIUS.sm,
  resize: "none"
};

export const InlineEditableText = ({
  value,
  editing,
  onEditingChange,
  onCommit,
  onCancel,
  selectOnFocus = true,
  multiline = false,
  maxLength,
  placeholder,
  ariaLabel,
  as = "span",
  displayAsInput = false,
  title,
  unstyled = false,
  allowEmpty = false,
  sanitize,
  onDraftChange,
  stopPropagation = true,
  className,
  sx,
  displayClassName,
  displaySx,
  children
}: InlineEditableTextProps) => {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  /**
   * Set by Escape and by an Enter that already committed. The blur those cause
   * arrives after edit mode is gone and must be swallowed.
   */
  const suppressBlurRef = useRef(false);
  /** Mirrors the prop so a blur can tell "still editing" from "already left". */
  const editingRef = useRef(editing);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    editingRef.current = editing;
    if (!editing) {
      return;
    }
    suppressBlurRef.current = false;
    setDraft(valueRef.current);
    // The input is not mounted until this render lands, and a deferred focus
    // also outruns a closing menu's own focus handling.
    const id = setTimeout(() => {
      inputRef.current?.focus();
      if (selectOnFocus) {
        inputRef.current?.select();
      }
    }, 0);
    return () => clearTimeout(id);
  }, [editing, selectOnFocus]);

  const commit = useCallback(
    (raw: string) => {
      // A blur fires even when this element is no longer in edit mode — never
      // commit a draft from a finished editing session.
      if (!editingRef.current) {
        return;
      }
      editingRef.current = false;
      onEditingChange(false);
      const next = raw.trim();
      if (!next && !allowEmpty) {
        return;
      }
      if (next === value) {
        return;
      }
      onCommit(next);
    },
    [allowEmpty, onCommit, onEditingChange, value]
  );

  const cancel = useCallback(() => {
    suppressBlurRef.current = true;
    editingRef.current = false;
    setDraft(valueRef.current);
    onEditingChange(false);
    onCancel?.();
  }, [onCancel, onEditingChange]);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (suppressBlurRef.current) {
        suppressBlurRef.current = false;
        return;
      }
      commit(event.currentTarget.value);
    },
    [commit]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter") {
        if (multiline && !(event.metaKey || event.ctrlKey)) {
          return;
        }
        event.preventDefault();
        if (stopPropagation) {
          event.stopPropagation();
        }
        const raw = event.currentTarget.value;
        suppressBlurRef.current = true;
        commit(raw);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (stopPropagation) {
          event.stopPropagation();
        }
        cancel();
      }
    },
    [cancel, commit, multiline, stopPropagation]
  );

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (stopPropagation) {
        event.stopPropagation();
      }
    },
    [stopPropagation]
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (selectOnFocus) {
        event.currentTarget.select();
      }
    },
    [selectOnFocus]
  );

  const handleDisplayDoubleClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      if (stopPropagation) {
        event.stopPropagation();
      }
      onEditingChange(true);
    },
    [onEditingChange, stopPropagation]
  );

  if (editing || displayAsInput) {
    return (
      <Box
        component={multiline ? "textarea" : "input"}
        ref={inputRef}
        className={className}
        aria-label={ariaLabel}
        value={editing ? draft : value}
        readOnly={!editing}
        title={editing ? undefined : title}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={multiline ? 2 : undefined}
        type={multiline ? undefined : "text"}
        onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          const next = sanitize
            ? sanitize(event.target.value)
            : event.target.value;
          setDraft(next);
          onDraftChange?.(next);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onDoubleClick={editing ? handleClick : handleDisplayDoubleClick}
        sx={(unstyled ? sx : { ...inputBaseSx, ...sx }) as SxProps<Theme>}
      />
    );
  }

  if (children !== undefined) {
    return <>{children}</>;
  }

  return (
    <Box
      component={as}
      className={displayClassName}
      title={title}
      onDoubleClick={handleDisplayDoubleClick}
      sx={displaySx}
    >
      {value}
    </Box>
  );
};

export default InlineEditableText;
