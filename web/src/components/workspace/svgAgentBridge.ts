import { createAgentHandlerRegistry } from "../../lib/tools/agentHandlerRegistry";
/**
 * svgAgentBridge
 *
 * Bridge between the `ui_svg_*` frontend tools and the SVG surfaces open in
 * edit mode. Each one registers an {@link SvgAgentHandler} under its asset id
 * and clears it on unmount, so the tools address an SVG by id whether or not
 * its tab has focus.
 *
 * The tools edit the surface's unsaved draft. The user sees the change in the
 * preview, can undo it in the editor, and keeps it with Save or `ui_svg_save`.
 */

/** What the agent reads from an open SVG before it edits. */
export interface SvgSnapshot {
  assetId: string;
  name: string;
  /** The draft markup, including unsaved edits. */
  markup: string;
  /** The draft differs from the saved asset. */
  dirty: boolean;
}

/** Operations an SVG surface in edit mode exposes to the agent. */
export interface SvgAgentHandler {
  getSnapshot: () => SvgSnapshot;
  /** Replace the draft markup. */
  setMarkup: (markup: string) => SvgSnapshot;
  /** Write the draft back to the asset. Resolves once the asset is stored. */
  save: () => Promise<SvgSnapshot>;
}

const handlers = createAgentHandlerRegistry<SvgAgentHandler>();

export function setSvgAgentHandler(
  assetId: string,
  next: SvgAgentHandler | null
): void {
  handlers.set(assetId, next);
}

export function hasSvgAgentHandler(assetId: string): boolean {
  return handlers.has(assetId);
}

export function listOpenSvgIds(): string[] {
  return [...handlers.keys()];
}

export function getSvgAgentHandler(assetId: string): SvgAgentHandler {
  const handler = handlers.get(assetId);
  if (!handler) {
    const open = listOpenSvgIds();
    throw new Error(
      `No SVG "${assetId}" is open for editing. ` +
        (open.length > 0
          ? `Open SVGs: ${open.join(", ")}. `
          : "No SVGs are open for editing. ") +
        'Call ui_open_document with type "svg" to open it.'
    );
  }
  return handler;
}

export const whenSvgAgentReady = (
  id: string,
  signal: AbortSignal
): Promise<boolean> => handlers.whenReady(id, () => true, signal);
