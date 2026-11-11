import { useMemo } from "react";
import { trpc } from "../../trpc/client";
import { useGenerationActivityStore } from "../../stores/GenerationActivityStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import type { Message } from "../../stores/ApiTypes";
import { extractGenerationTurns } from "../chat/generation/extractGenerationTurns";
import { buildCreateFeed, buildSessionFeed, type CreateFeedItem } from "./createFeed";

/** Older renders read per media type; the grid shows the newest of each. */
const OLDER_RENDERS_PAGE = 60;

/** Takes one Create tab lists from the server after a reload. */
const SESSION_TAKES_PAGE = 200;

const LIST_OPTIONS = { staleTime: 30_000, retry: false } as const;

const NO_MESSAGES: Message[] = [];

interface CreateFeed {
  items: CreateFeedItem[];
  /** True until the first list answers, so the grid is not called empty early. */
  loadingOlder: boolean;
  /** Set when a list failed. Tracked generations still show. */
  olderError: Error | null;
  refetchOlder: () => void;
}

/**
 * The takes a Create grid shows. With a `sessionId`, only that tab's takes:
 * tracked generations tagged with its thread, the server's rows for it, and
 * the takes in the thread's messages when it was a media chat. Without one,
 * every take: tracked generations, then older renders from the
 * asset list.
 */
export const useCreateFeed = (sessionId: string | null): CreateFeed => {
  const generations = useGenerationActivityStore((state) => state.generations);
  const messages = useGlobalChatStore((state) =>
    sessionId ? state.messageCache[sessionId] ?? NO_MESSAGES : NO_MESSAGES
  );
  const all = sessionId === null;
  const images = trpc.assets.list.useQuery(
    { content_type: "image", page_size: OLDER_RENDERS_PAGE },
    { ...LIST_OPTIONS, enabled: all }
  );
  const videos = trpc.assets.list.useQuery(
    { content_type: "video", page_size: OLDER_RENDERS_PAGE },
    { ...LIST_OPTIONS, enabled: all }
  );
  const audios = trpc.assets.list.useQuery(
    { content_type: "audio", page_size: OLDER_RENDERS_PAGE },
    { ...LIST_OPTIONS, enabled: all }
  );
  const takes = trpc.generations.list.useQuery(
    { thread_id: sessionId ?? "", limit: SESSION_TAKES_PAGE },
    { ...LIST_OPTIONS, enabled: !all }
  );
  const imageAssets = images.data?.assets;
  const videoAssets = videos.data?.assets;
  const audioAssets = audios.data?.assets;
  const records = takes.data?.generations;

  const items = useMemo(
    () =>
      sessionId === null
        ? buildCreateFeed(Object.values(generations), [
            ...(imageAssets ?? []),
            ...(videoAssets ?? []),
            ...(audioAssets ?? [])
          ])
        : buildSessionFeed(
            sessionId,
            Object.values(generations),
            records ?? [],
            // Old media turns are finished: new takes are tracked generations.
            extractGenerationTurns(messages, "connected")
          ),
    [sessionId, generations, imageAssets, videoAssets, audioAssets, records, messages]
  );

  if (!all) {
    return {
      items,
      loadingOlder: takes.isLoading,
      olderError: takes.error as Error | null,
      refetchOlder: () => {
        void takes.refetch();
      }
    };
  }
  return {
    items,
    loadingOlder: images.isLoading || videos.isLoading || audios.isLoading,
    olderError: (images.error ?? videos.error ?? audios.error) as Error | null,
    refetchOlder: () => {
      void images.refetch();
      void videos.refetch();
      void audios.refetch();
    }
  };
};
