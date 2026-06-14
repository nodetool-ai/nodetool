/**
 * SlashCommandNode — the inline "/" command affordance in the transcript.
 *
 * Typing "/" inserts this node: a boxed "/" chip followed by a query input and a
 * filtered command menu (Descript-style). It disambiguates *issuing a command*
 * from *typing transcript words* — the chip + accent-colored query make the
 * command mode visible. The node is a self-contained {@link DecoratorNode}: its
 * input is an ordinary `<input>`, independently focusable even while the script
 * editor is read-only (Script mode), so the same affordance works in both modes.
 *
 * Running a command removes the node; Escape / blur / Backspace-on-empty cancels.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { styled } from "@mui/material/styles";
import {
  DecoratorNode,
  $getNodeByKey,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import {
  useTimelineStoreApi,
  useTimelinePlaybackStoreApi
} from "../../../stores/timeline/TimelineInstance";
import type { TimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import type { TimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import { FONT_SIZE_SANS, BORDER_RADIUS } from "../../ui_primitives";

// ── Commands ──────────────────────────────────────────────────────────────────

interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  run: (doc: TimelineStoreApi, playback: TimelinePlaybackStoreApi) => void;
}

const COMMANDS: SlashCommand[] = [
  {
    id: "scene",
    label: "New scene",
    hint: "Marker + cut every clip at the playhead",
    run: (doc, playback) => {
      const { currentTimeMs } = playback.getState();
      const { addScene, markers } = doc.getState();
      // Marker + split-all-at-playhead in one undo step.
      addScene(currentTimeMs, `Scene ${markers.length + 1}`);
    }
  }
];

// ── Styles ──────────────────────────────────────────────────────────────────

const Host = styled("span")(({ theme }) => ({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  verticalAlign: "baseline",
  "& .slash-chip": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 18,
    height: 20,
    padding: "0 4px",
    borderRadius: BORDER_RADIUS.sm,
    border: `1px solid ${theme.vars.palette.divider}`,
    background: theme.vars.palette.action.hover,
    color: theme.vars.palette.text.secondary,
    fontStyle: "italic",
    fontSize: FONT_SIZE_SANS.label,
    lineHeight: "18px"
  },
  "& .slash-input": {
    border: "none",
    outline: "none",
    background: "transparent",
    color: theme.vars.palette.primary.main,
    font: "inherit",
    fontSize: FONT_SIZE_SANS.body,
    minWidth: 40,
    width: 90,
    padding: 0
  },
  "& .slash-menu": {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    zIndex: 20,
    margin: 0,
    padding: 4,
    listStyle: "none",
    minWidth: 220,
    borderRadius: BORDER_RADIUS.lg,
    border: `1px solid ${theme.vars.palette.divider}`,
    background: theme.vars.palette.background.paper,
    boxShadow: theme.vars.shadows?.[6] ?? "0 6px 24px rgba(0,0,0,0.4)"
  },
  "& .slash-item": {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    padding: "6px 8px",
    borderRadius: BORDER_RADIUS.md,
    cursor: "pointer"
  },
  "& .slash-item.is-active": {
    background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.18)`
  },
  "& .slash-item .cmd-label": {
    fontSize: FONT_SIZE_SANS.label,
    color: theme.vars.palette.text.primary
  },
  "& .slash-item .cmd-hint": {
    fontSize: FONT_SIZE_SANS.caption,
    color: theme.vars.palette.text.disabled
  },
  "& .slash-empty": {
    padding: "6px 8px",
    fontSize: "var(--fontSizeSmall)",
    color: theme.vars.palette.text.disabled
  }
}));

// ── Component ─────────────────────────────────────────────────────────────────

const SlashCommandMenu: React.FC<{ nodeKey: NodeKey }> = ({ nodeKey }) => {
  const [editor] = useLexicalComposerContext();
  const docApi = useTimelineStoreApi();
  const playbackApi = useTimelinePlaybackStoreApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const matches = useMemo(
    () =>
      COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [query]
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const remove = useCallback(() => {
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove();
    });
  }, [editor, nodeKey]);

  const run = useCallback(
    (cmd: SlashCommand) => {
      cmd.run(docApi, playbackApi);
      remove();
    },
    [docApi, playbackApi, remove]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, matches.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (matches[active]) run(matches[active]);
      } else if (e.key === "Escape" || (e.key === "Backspace" && query === "")) {
        e.preventDefault();
        remove();
      }
    },
    [matches, active, query, run, remove]
  );

  return (
    <Host contentEditable={false} data-testid="slash-command">
      <span className="slash-chip">/</span>
      <input
        ref={inputRef}
        className="slash-input"
        value={query}
        spellCheck={false}
        aria-label="Slash command"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={remove}
      />
      <ul className="slash-menu">
        {matches.length === 0 ? (
          <li className="slash-empty">No commands</li>
        ) : (
          matches.map((c, i) => (
            <li
              key={c.id}
              className={`slash-item${i === active ? " is-active" : ""}`}
              data-testid={`slash-item-${c.id}`}
              // mousedown + preventDefault keeps the input focused so its blur
              // (which cancels) doesn't fire before the command runs.
              onMouseDown={(e) => {
                e.preventDefault();
                run(c);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="cmd-label">{c.label}</span>
              <span className="cmd-hint">{c.hint}</span>
            </li>
          ))
        )}
      </ul>
    </Host>
  );
};

// ── Node ──────────────────────────────────────────────────────────────────────

export type SerializedSlashCommandNode = SerializedLexicalNode & {
  type: "slash-command";
  version: 1;
};

export class SlashCommandNode extends DecoratorNode<React.ReactElement> {
  static getType(): string {
    return "slash-command";
  }

  static clone(node: SlashCommandNode): SlashCommandNode {
    return new SlashCommandNode(node.__key);
  }

  static importJSON(): SlashCommandNode {
    return $createSlashCommandNode();
  }

  exportJSON(): SerializedSlashCommandNode {
    return { type: "slash-command", version: 1 };
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "slash-command-host";
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return false;
  }

  decorate(): React.ReactElement {
    return <SlashCommandMenu nodeKey={this.getKey()} />;
  }
}

export const $createSlashCommandNode = (): SlashCommandNode =>
  new SlashCommandNode();

export const $isSlashCommandNode = (
  node: LexicalNode | null | undefined
): node is SlashCommandNode => node instanceof SlashCommandNode;
