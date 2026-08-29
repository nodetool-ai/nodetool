/**
 * Every document the user owns, in one ordered feed.
 *
 * The sidebar lists each document type in its own panel; a surface that needs
 * them together reads this hook instead, which reads the same queries those
 * panels use — the caches are shared, not duplicated — and folds them into one
 * shape alongside the assets that open as documents (images, audio, 3D
 * models, text files).
 *
 * Workflows and chats are deliberately absent: they already get a section of
 * their own elsewhere.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { trpc, trpcClient } from "../trpc/client";
import { useApplications } from "./useApplications";
import { useTimelines } from "./useTimelineSequence";
import { useStoryboards } from "./storyboard/useStoryboards";
import { useScripts } from "./script/useScripts";
import { useJsScripts } from "./jsScript/useJsScripts";
import { assetTabType } from "../components/workspace/assetTabType";
import type { WorkspaceTabType } from "../stores/WorkspaceTabsStore";

/** How many assets this hook reads from the user's home folder. */
const RECENT_DOCUMENTS_ASSET_PAGE_SIZE = 200;

const STALE_TIME = 30_000;

/** The asset content types that have a workspace surface to open them in. */
const ASSET_KINDS = ["image", "audio", "model3d", "text"] as const;
type AssetKind = (typeof ASSET_KINDS)[number];

export type DocumentKind =
  | "app"
  | "sketch"
  | "timeline"
  | "storyboard"
  | "script"
  | "jsscript"
  | AssetKind;

/** Section filter order, which is also the chip order in the UI. */
export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  "app",
  "sketch",
  "timeline",
  "storyboard",
  "script",
  "jsscript",
  "image",
  "audio",
  "model3d",
  "text"
];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  app: "Apps",
  sketch: "Sketches",
  timeline: "Videos",
  storyboard: "Storyboards",
  script: "Scripts",
  jsscript: "JS scripts",
  image: "Images",
  audio: "Audio",
  model3d: "3D models",
  text: "Text"
};

/** The workspace tab that opens a document of each kind. */
const KIND_TAB_TYPE: Record<DocumentKind, WorkspaceTabType> = {
  app: "application",
  sketch: "sketch",
  timeline: "timeline",
  storyboard: "storyboard",
  script: "script",
  jsscript: "jsscript",
  image: "image",
  audio: "audio",
  model3d: "model3d",
  text: "text"
};

export interface RecentDocument {
  /** `${kind}:${id}` — unique across types, which ids alone are not. */
  key: string;
  id: string;
  kind: DocumentKind;
  name: string;
  /** ISO timestamp the feed orders on. */
  updatedAt: string;
  /** The workspace tab that opens this document. */
  tabType: WorkspaceTabType;
  /** Asset thumbnail, or null for a document that has none. */
  thumbUrl: string | null;
}

/** The fields every typed list item carries, whatever the router. */
interface ListItemLike {
  id: string;
  name: string;
  updatedAt: string;
}

const isAssetKind = (tab: WorkspaceTabType): tab is AssetKind =>
  ASSET_KINDS.some((kind) => kind === tab);

const toDocument = (
  kind: DocumentKind,
  item: ListItemLike,
  fallbackName: string
): RecentDocument => ({
  key: `${kind}:${item.id}`,
  id: item.id,
  kind,
  name: item.name || fallbackName,
  updatedAt: item.updatedAt,
  tabType: KIND_TAB_TYPE[kind],
  // Only assets carry a thumbnail; the typed documents render their icon.
  thumbUrl: null
});

const listAssets = () =>
  trpcClient.assets.list.query({ page_size: RECENT_DOCUMENTS_ASSET_PAGE_SIZE });

interface UseRecentDocumentsResult {
  documents: RecentDocument[];
  isLoading: boolean;
}

export const useRecentDocuments = (): UseRecentDocumentsResult => {
  const apps = useApplications();
  const sketches = trpc.sketch.list.useQuery({}, { staleTime: STALE_TIME });
  const timelines = useTimelines();
  const storyboards = useStoryboards();
  const scripts = useScripts();
  const jsScripts = useJsScripts();
  const assets = useQuery({
    queryKey: ["recent-documents", "assets", RECENT_DOCUMENTS_ASSET_PAGE_SIZE],
    queryFn: listAssets,
    staleTime: STALE_TIME
  });

  const documents = useMemo<RecentDocument[]>(() => {
    const typed: RecentDocument[] = [
      ...(apps.data ?? []).map((item) => toDocument("app", item, "Untitled app")),
      ...(sketches.data ?? []).map((item) =>
        toDocument("sketch", item, "Untitled sketch")
      ),
      ...(timelines.data ?? []).map((item) =>
        toDocument("timeline", item, "Untitled video")
      ),
      ...(storyboards.data ?? []).map((item) =>
        toDocument("storyboard", item, "Untitled storyboard")
      ),
      ...(scripts.data ?? []).map((item) =>
        toDocument("script", item, "Untitled script")
      ),
      ...(jsScripts.data ?? []).map((item) =>
        toDocument("jsscript", item, "Untitled JS script")
      )
    ];

    const fromAssets = (assets.data?.assets ?? []).flatMap(
      (asset): RecentDocument[] => {
        // A sketch's saved image is already in the feed as its sketch
        // document; listing the asset too would show the artwork twice.
        if (asset.sketch_document_id) {
          return [];
        }
        const tabType = assetTabType(asset);
        if (tabType === null || !isAssetKind(tabType)) {
          return [];
        }
        return [
          {
            key: `${tabType}:${asset.id}`,
            id: asset.id,
            kind: tabType,
            name: asset.name || "Untitled",
            // Assets are immutable once written, so creation is their date.
            updatedAt: asset.created_at,
            tabType,
            thumbUrl: asset.thumb_url ?? null
          }
        ];
      }
    );

    return [...typed, ...fromAssets].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [
    apps.data,
    sketches.data,
    timelines.data,
    storyboards.data,
    scripts.data,
    jsScripts.data,
    assets.data
  ]);

  return {
    documents,
    isLoading:
      apps.isLoading ||
      sketches.isLoading ||
      timelines.isLoading ||
      storyboards.isLoading ||
      scripts.isLoading ||
      jsScripts.isLoading ||
      assets.isLoading
  };
};
