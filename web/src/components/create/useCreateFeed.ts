import { useMemo } from "react";
import { trpc } from "../../trpc/client";
import { useGenerationActivityStore } from "../../stores/GenerationActivityStore";
import { buildCreateFeed, type CreateFeedItem } from "./createFeed";

/** Older renders read per media type; the grid shows the newest of each. */
const OLDER_RENDERS_PAGE = 60;

const LIST_OPTIONS = { staleTime: 30_000, retry: false } as const;

interface CreateFeed {
  items: CreateFeedItem[];
  /** True until the first asset list answers, so the grid is not called empty early. */
  loadingOlder: boolean;
  /** Set when the asset list failed. Tracked generations still show. */
  olderError: Error | null;
  refetchOlder: () => void;
}

/** Tracked generations from GenerationActivityStore, then older renders. */
export const useCreateFeed = (): CreateFeed => {
  const generations = useGenerationActivityStore((state) => state.generations);
  const images = trpc.assets.list.useQuery(
    { content_type: "image", page_size: OLDER_RENDERS_PAGE },
    LIST_OPTIONS
  );
  const videos = trpc.assets.list.useQuery(
    { content_type: "video", page_size: OLDER_RENDERS_PAGE },
    LIST_OPTIONS
  );
  const imageAssets = images.data?.assets;
  const videoAssets = videos.data?.assets;

  const items = useMemo(
    () =>
      buildCreateFeed(Object.values(generations), [
        ...(imageAssets ?? []),
        ...(videoAssets ?? [])
      ]),
    [generations, imageAssets, videoAssets]
  );

  return {
    items,
    loadingOlder: images.isLoading || videos.isLoading,
    olderError: (images.error ?? videos.error) as Error | null,
    refetchOlder: () => {
      void images.refetch();
      void videos.refetch();
    }
  };
};
