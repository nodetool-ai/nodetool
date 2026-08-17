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
 * The kinds mobile opens as documents.
 *
 * Not the same set as the server's `ResourceKind`: `asset` is a library entry
 * with its own screen rather than a document, and `script` and `jsscript` are
 * documents the `resources` envelope cannot carry (neither table has a
 * `revision` column), so they travel over `scripts.*` and `jsScripts.*`
 * instead. `backends.ts` maps each kind to its transport.
 */
export type DocumentKind = Exclude<ResourceKind, 'asset'> | 'script' | 'jsscript';

/** The kinds the `resources.*` envelope can list and write. */
export type ResourceDocumentKind = Exclude<DocumentKind, 'script' | 'jsscript'>;

/**
 * How much the surface lets a person do directly.
 *
 * `editor` means direct manipulation is available. `viewer` means the screen
 * shows the document but does not edit it — the agent still can, through the
 * `ui_*` tools, which is the point: a timeline is far too dense to arrange with
 * fingers, but "move the title card two seconds later" is a sentence.
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
  route:
    | 'StoryboardEditor'
    | 'TimelineViewer'
    | 'ScriptEditor'
    | 'JsScriptEditor'
    | 'SketchViewer'
    | 'DocumentViewer';
  /** Whether the browser offers a "new document" action for this kind. */
  creatable: boolean;
  /**
   * Whether the agent's `ui_*` tools can write this kind. Independent of
   * `surface`: the timeline is agent-editable but has no direct-manipulation
   * editor, which is exactly the split the browser needs to communicate.
   */
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
    kind: 'script',
    label: 'Script',
    plural: 'Scripts',
    icon: 'document-text-outline',
    surface: 'editor',
    route: 'ScriptEditor',
    creatable: true,
    agentEditable: true,
  },
  {
    kind: 'jsscript',
    label: 'JS Script',
    plural: 'JS Scripts',
    icon: 'code-slash-outline',
    surface: 'editor',
    route: 'JsScriptEditor',
    creatable: true,
    agentEditable: true,
  },
  {
    kind: 'timeline',
    label: 'Timeline',
    plural: 'Timelines',
    icon: 'film-outline',
    // No direct-manipulation editor — arranging clips by touch is not viable at
    // phone width — but the agent edits it through `ui_timeline_*`.
    surface: 'viewer',
    route: 'TimelineViewer',
    creatable: false,
    agentEditable: true,
  },
  {
    kind: 'sketch',
    label: 'Sketch',
    plural: 'Sketches',
    icon: 'brush-outline',
    // Composited layers, read-only. A canvas is not the phone's job, and there
    // are no `ui_sketch_*` tools yet, so nothing edits this from here.
    surface: 'viewer',
    route: 'SketchViewer',
    creatable: false,
    agentEditable: false,
  },
] as const;

const BY_KIND = new Map<string, DocumentKindInfo>(
  DOCUMENT_KINDS.map((entry) => [entry.kind, entry])
);

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
    case 'script':
      return 'script';
    case 'jsscript':
      return 'jsscript';
    case 'sketch':
      return 'sketch';
    default:
      // An asset has no ui_* tools; naming it would only invite bad calls.
      return null;
  }
}
