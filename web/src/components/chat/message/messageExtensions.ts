/**
 * Surfaces that run their own agent loop can teach the thread to render some
 * turns as widgets instead of plain rows:
 *
 * - an **inline tool widget** replaces a tool call's row with a component, so
 *   a call such as `ui_app_run_show_step` reads as the card it shows;
 * - a **user turn renderer** replaces a user bubble the surface wrote on the
 *   user's behalf (an app event) with a compact chip.
 *
 * Registration is global and done by the surface's module on import. A thread
 * opened elsewhere without that module renders those turns as ordinary rows.
 */
import type React from "react";

import type { Message, ToolCall } from "../../../stores/ApiTypes";

export interface InlineToolWidgetProps {
  toolCall: ToolCall;
  /** The tool's result content once it returned. */
  result?: unknown;
  threadId?: string | null;
}

export type InlineToolWidget = React.ComponentType<InlineToolWidgetProps>;

export interface UserTurnRendererProps {
  message: Message;
  text: string;
}

/** Returns a component for this user turn's text, or null to keep the bubble. */
export type UserTurnRenderer = (
  text: string
) => React.ComponentType<UserTurnRendererProps> | null;

const inlineToolWidgets = new Map<string, InlineToolWidget>();
const userTurnRenderers = new Set<UserTurnRenderer>();

export function registerInlineToolWidget(
  toolName: string,
  widget: InlineToolWidget
): () => void {
  inlineToolWidgets.set(toolName, widget);
  return () => {
    if (inlineToolWidgets.get(toolName) === widget) {
      inlineToolWidgets.delete(toolName);
    }
  };
}

export function inlineToolWidgetFor(
  toolName: string | null | undefined
): InlineToolWidget | undefined {
  return toolName ? inlineToolWidgets.get(toolName) : undefined;
}

export function registerUserTurnRenderer(
  renderer: UserTurnRenderer
): () => void {
  userTurnRenderers.add(renderer);
  return () => {
    userTurnRenderers.delete(renderer);
  };
}

export function userTurnRendererFor(
  text: string
): React.ComponentType<UserTurnRendererProps> | null {
  for (const renderer of userTurnRenderers) {
    const component = renderer(text);
    if (component) return component;
  }
  return null;
}
