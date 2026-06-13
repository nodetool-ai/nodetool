/**
 * SceneBreakNode — the persistent "scene boundary" shown inline in the script.
 *
 * Scene breaks are *projected from the timeline markers* (the markers are the
 * source of truth, so a break survives the editor's reseed-from-clips). Each
 * break renders a labeled divider with a × that removes it: deleting the break
 * removes its linked marker AND merges back any clip that the scene split — the
 * inverse of the "New scene" command. A block-level {@link DecoratorNode}; its
 * text content is empty so the transcript reconcile ignores it.
 */

import React, { useCallback } from "react";
import { styled } from "@mui/material/styles";
import {
  DecoratorNode,
  $getNodeByKey,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import { useTimelineStoreApi } from "../../../stores/timeline/TimelineInstance";
import { MOTION, FONT_SIZE_SANS, FONT_WEIGHT, BORDER_RADIUS } from "../../ui_primitives";

// ── Styles ──────────────────────────────────────────────────────────────────

const Row = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  margin: "10px 0",
  userSelect: "none",
  "& .line": {
    flex: 1,
    height: 1,
    background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.4)`
  },
  "& .label": {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "1px 8px",
    borderRadius: BORDER_RADIUS.pill,
    fontSize: FONT_SIZE_SANS.caption,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: "0.04em",
    color: theme.vars.palette.primary.contrastText,
    background: theme.vars.palette.primary.main
  },
  "& .del": {
    border: "none",
    background: "transparent",
    color: theme.vars.palette.text.disabled,
    cursor: "pointer",
    fontSize: FONT_SIZE_SANS.body,
    lineHeight: 1,
    padding: 2,
    borderRadius: BORDER_RADIUS.sm,
    opacity: 0,
    transition: `opacity ${MOTION.fast}, color ${MOTION.fast}`
  },
  "&:hover .del": { opacity: 1 },
  "& .del:hover": { color: theme.vars.palette.error.main }
}));

// ── Component ─────────────────────────────────────────────────────────────────

const SceneBreak: React.FC<{
  nodeKey: NodeKey;
  markerId: string;
  label: string;
}> = ({ nodeKey, markerId, label }) => {
  const [editor] = useLexicalComposerContext();
  const docApi = useTimelineStoreApi();

  const remove = useCallback(() => {
    // Remove the marker AND merge back the clip it split, in one undo step.
    docApi.getState().removeScene(markerId);
    // Drop the node now; the marker-driven reseed would also remove it.
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove();
    });
  }, [docApi, markerId, editor, nodeKey]);

  return (
    <Row contentEditable={false} data-testid="scene-break">
      <span className="line" />
      <span className="label">{label}</span>
      <button
        type="button"
        className="del"
        data-testid="scene-break-delete"
        aria-label={`Remove ${label}`}
        onClick={remove}
      >
        ×
      </button>
      <span className="line" />
    </Row>
  );
};

// ── Node ──────────────────────────────────────────────────────────────────────

export type SerializedSceneBreakNode = Spread<
  { type: "scene-break"; version: 1; markerId: string; label: string },
  SerializedLexicalNode
>;

export class SceneBreakNode extends DecoratorNode<React.ReactElement> {
  __markerId: string;
  __label: string;

  static getType(): string {
    return "scene-break";
  }

  static clone(node: SceneBreakNode): SceneBreakNode {
    return new SceneBreakNode(node.__markerId, node.__label, node.__key);
  }

  static importJSON(serialized: SerializedSceneBreakNode): SceneBreakNode {
    return $createSceneBreakNode(serialized.markerId, serialized.label);
  }

  constructor(markerId: string, label: string, key?: NodeKey) {
    super(key);
    this.__markerId = markerId;
    this.__label = label;
  }

  exportJSON(): SerializedSceneBreakNode {
    return {
      type: "scene-break",
      version: 1,
      markerId: this.__markerId,
      label: this.__label
    };
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): boolean {
    return false;
  }

  decorate(): React.ReactElement {
    return (
      <SceneBreak
        nodeKey={this.getKey()}
        markerId={this.__markerId}
        label={this.__label}
      />
    );
  }
}

export const $createSceneBreakNode = (
  markerId: string,
  label: string
): SceneBreakNode => new SceneBreakNode(markerId, label);

export const $isSceneBreakNode = (
  node: LexicalNode | null | undefined
): node is SceneBreakNode => node instanceof SceneBreakNode;
