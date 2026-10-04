/**
 * The document kinds mobile can open, and how each one is presented.
 *
 * Web keys this off `WorkspaceTabType` because every document lives in a tab.
 * Mobile has no tabs: a document is a pushed screen, so the registry only has
 * to answer three questions — what to call the kind, which icon to draw, and
 * which screen to push. The kind ids themselves are the server's
 * `ResourceKind`, so `trpc.resources.*` can address any of them.
 */

import type { ResourceKind } from '@nodetool-ai/app-runtime';

/**
 * The kinds mobile opens as documents: storyboards, timelines, and sketches.
 *
 * The server's `ResourceKind` minus `asset`, which is a library entry with its
 * own screen rather than a document. Every other document kind (scripts, JS
 * scripts, …) opens in the desktop or web app; mobile does not list it.
 */
export type DocumentKind = Exclude<ResourceKind, 'asset'>;

/** The kinds the `resources.*` envelope can list and write. */
export type ResourceDocumentKind = DocumentKind;

/**
 * How much the surface lets a person do directly.
 *
 * `editor` means direct manipulation is available. `viewer` means the screen
 * shows the document and nothing on the phone writes it: timelines and
 * sketches are edited on desktop or web, or by the server agent's own tools,
 * and the viewer reloads on focus to pick those edits up.
 */
export type DocumentSurface = 'editor' | 'viewer';

interface DocumentKindInfo {
  kind: DocumentKind;
  /** Singular label, e.g. "Storyboard". */
  label: string;
  /** Plural label for section headers, e.g. "Storyboards". */
  plural: string;
  /** Ionicons name (outline variant, per mobile convention). */
  icon: string;
  surface: DocumentSurface;
  /** Route pushed to open one. */
  route: 'StoryboardEditor' | 'TimelineViewer' | 'SketchViewer';
  /** Whether the browser offers a "new document" action for this kind. */
  creatable: boolean;
  /** Whether the client-side `ui_*` tools can write this kind. */
  agentEditable: boolean;
}

export const DOCUMENT_KINDS: readonly DocumentKindInfo[] = [
  {
    kind: 'storyboard',
    label: 'Storyboard',
    plural: 'Storyboards',
    icon: 'albums-outline',
    surface: 'editor',
    route: 'StoryboardEditor',
    creatable: true,
    agentEditable: true,
  },
  {
    kind: 'timeline',
    label: 'Timeline',
    plural: 'Timelines',
    icon: 'film-outline',
    // View only. Arranging clips by touch is not viable at phone width; the
    // desktop editor and the server agent's timeline tools write it.
    surface: 'viewer',
    route: 'TimelineViewer',
    creatable: false,
    agentEditable: false,
  },
  {
    kind: 'sketch',
    label: 'Sketch',
    plural: 'Sketches',
    icon: 'brush-outline',
    // Composited layers, read-only. A canvas is not the phone's job.
    surface: 'viewer',
    route: 'SketchViewer',
    creatable: false,
    agentEditable: false,
  },
] as const;

const BY_KIND = new Map<string, DocumentKindInfo>(
  DOCUMENT_KINDS.map((entry) => [entry.kind, entry])
);

/**
 * The registry entry for a kind string, or undefined when mobile does not open
 * that kind. Server data and agent output can name any kind, so callers that
 * hold an unchecked string go through this rather than `documentKindInfo`.
 */
export function findDocumentKindInfo(kind: string): DocumentKindInfo | undefined {
  return BY_KIND.get(kind);
}

export function documentKindInfo(kind: DocumentKind): DocumentKindInfo {
  const info = BY_KIND.get(kind);
  if (!info) {
    throw new Error(`Unknown document kind: ${kind}`);
  }
  return info;
}

/**
 * The agent-facing surface name for a kind. Mirrors web's
 * `TAB_TYPE_TO_SURFACE` — the ids handed to the agent in `ui_context` must use
 * the protocol's `UiSurfaceType` spelling, not our route names.
 */
export function uiSurfaceForKind(kind: DocumentKind): string | null {
  switch (kind) {
    case 'storyboard':
      return 'storyboard';
    case 'timeline':
      return 'timeline';
    case 'sketch':
      return 'sketch';
    default:
      return null;
  }
}
