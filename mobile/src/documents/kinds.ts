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
 * Whether the surface can write the document back. `viewer` kinds are opened
 * read-only — the timeline is far too dense to edit on a phone, and an asset
 * is not a document at all.
 */
export type DocumentSurface = 'editor' | 'viewer';

export interface DocumentKindInfo {
  kind: ResourceKind;
  /** Singular label, e.g. "Storyboard". */
  label: string;
  /** Plural label for section headers, e.g. "Storyboards". */
  plural: string;
  /** Ionicons name (outline variant, per mobile convention). */
  icon: string;
  surface: DocumentSurface;
  /** Route pushed to open one. */
  route: 'StoryboardEditor' | 'TimelineViewer' | 'DocumentViewer';
  /** Whether the browser offers a "new document" action for this kind. */
  creatable: boolean;
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
  },
  {
    kind: 'timeline',
    label: 'Timeline',
    plural: 'Timelines',
    icon: 'film-outline',
    surface: 'viewer',
    route: 'TimelineViewer',
    creatable: false,
  },
  {
    kind: 'sketch',
    label: 'Sketch',
    plural: 'Sketches',
    icon: 'brush-outline',
    surface: 'viewer',
    route: 'DocumentViewer',
    creatable: false,
  },
] as const;

const BY_KIND = new Map<string, DocumentKindInfo>(
  DOCUMENT_KINDS.map((entry) => [entry.kind, entry])
);

export function documentKindInfo(kind: ResourceKind): DocumentKindInfo {
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
export function uiSurfaceForKind(kind: ResourceKind): string | null {
  switch (kind) {
    case 'storyboard':
      return 'storyboard';
    case 'timeline':
      return 'timeline';
    case 'sketch':
      return 'sketch';
    default:
      // An asset has no ui_* tools; naming it would only invite bad calls.
      return null;
  }
}
