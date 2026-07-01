// Auto-adds media produced by a chat generation turn onto the active canvas as
// constant nodes. Kept in its own module (separate from useGenerationToCanvas)
// so that the lightweight `blockToConstant` / `useAddMediaToCanvas` helpers can
// be imported without pulling in the GlobalChatStore dependency graph.

import { useEffect, useRef } from "react";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import type { MessageContent } from "../../stores/ApiTypes";
import {
  isAudioContent,
  isImageContent,
  isMediaOnlyContent,
  isVideoContent
} from "../../components/chat/message/MediaOutputGroup.helpers";
import {
  useAddMediaToCanvas,
  type MediaContentBlock
} from "./useGenerationToCanvas";

/** Stable identity for a media block, used to avoid adding the same generated
 *  asset to the canvas twice. Empty when the block has no asset id or uri yet
 *  (e.g. mid-generation), in which case it is skipped. */
const mediaBlockKey = (block: MediaContentBlock): string => {
  if (block.type === "image_url") return block.image?.asset_id || block.image?.uri || "";
  if (block.type === "video") return block.video?.asset_id || block.video?.uri || "";
  return block.audio?.asset_id || block.audio?.uri || "";
};

/**
 * Auto-adds media produced by a chat generation turn onto the active canvas.
 * Fires once per turn, on the chat's busy → idle edge: the last assistant
 * message of a media-only turn has its blocks added as constant nodes. A no-op
 * when there's no canvas in scope (i.e. the standalone chat panel).
 */
export const useAutoAddGeneratedMediaToCanvas = (): void => {
  const { isCanvasAvailable, addBlocksToCanvas } = useAddMediaToCanvas();
  const status = useGlobalChatStore((state) => state.status);
  const currentThreadId = useGlobalChatStore((state) => state.currentThreadId);
  const messages = useGlobalChatStore((state) =>
    state.currentThreadId ? state.messageCache[state.currentThreadId] : undefined
  );

  const seenRef = useRef<Set<string>>(new Set());
  const wasBusyRef = useRef(false);

  useEffect(() => {
    const busy = status === "loading" || status === "streaming";
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;

    // Only act on the busy → idle edge (a generation just finished).
    if (busy || !wasBusy) return;
    if (!isCanvasAvailable || !messages || messages.length === 0) return;

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== "assistant") continue;
      // The most recent assistant reply decides the turn: add its media, or
      // bail if it wasn't a media generation.
      if (!isMediaOnlyContent(message.content)) return;
      const fresh = (message.content as MessageContent[])
        .filter(
          (c): c is MediaContentBlock =>
            isImageContent(c) || isVideoContent(c) || isAudioContent(c)
        )
        .filter((block) => {
          const key = mediaBlockKey(block);
          if (!key || seenRef.current.has(key)) return false;
          seenRef.current.add(key);
          return true;
        });
      if (fresh.length > 0) addBlocksToCanvas(fresh);
      return;
    }
  }, [status, messages, isCanvasAvailable, addBlocksToCanvas]);

  // Drop the dedupe memory when switching threads so a later turn in a new
  // thread that happens to reuse an asset id still adds.
  useEffect(() => {
    seenRef.current = new Set();
  }, [currentThreadId]);
};

export default useAutoAddGeneratedMediaToCanvas;
