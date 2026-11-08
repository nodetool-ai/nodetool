/**
 * Opens a new Create tab. Each tab is a Create session: a thread row of kind
 * "create" whose takes are generations tagged with its id, so it has a title,
 * a project and a place in the threads list, and lists its own takes after a
 * reload.
 */
import { queryClient } from "../../queryClient";
import { trpcClient } from "../../trpc/client";
import {
  useCreateViewStore,
  type CreateMode,
  type CreateReference
} from "../../stores/CreateViewStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { parseAssetUri } from "../node_types/editing/promptComposer/promptTokens";
import type { DroppedFile } from "../chat/types/chat.types";
import type { MessageContent } from "../../stores/ApiTypes";

/** What a new tab is called until its first prompt names it. */
export const CREATE_SESSION_TITLES: Record<CreateMode, string> = {
  image: "New image",
  image_edit: "New image",
  video: "New video",
  image_to_video: "New video",
  reference_to_video: "New video",
  retake: "New video",
  extend: "New video",
  audio: "Read aloud",
  music: "New music"
};

/** Longest tab title taken from a prompt. */
const PROMPT_TITLE_MAX = 60;

export interface OpenCreateSessionOptions {
  mode: CreateMode;
  /** The tab's name. Without one it is named after the mode, then its first prompt. */
  title?: string;
  prompt?: string;
  references?: readonly CreateReference[];
}

/**
 * The attachments a composer carried, as Create references. Only library
 * assets carry over: a file still being read has no asset id to send.
 */
export const referencesFromAttachments = (
  attachments: readonly DroppedFile[] | undefined
): CreateReference[] =>
  (attachments ?? []).flatMap((file) =>
    file.assetUri
      ? [{ assetId: parseAssetUri(file.assetUri).assetId, contentType: file.type, name: file.name }]
      : []
  );

/**
 * What "Open in Create" carries from a chat reply: its prompt, and its stored
 * pictures as sources to edit, or its first clip to retake. Audio carries the
 * prompt only. `generatedMode` is the mode the reply was generated in, if any.
 */
export const createSeedFromMedia = (
  prompt: string,
  media: readonly MessageContent[],
  generatedMode?: string | null
): OpenCreateSessionOptions => {
  const images: CreateReference[] = [];
  const videos: CreateReference[] = [];
  for (const item of media) {
    if (item.type === "image_url" && item.image?.asset_id) {
      images.push({ assetId: item.image.asset_id, contentType: "image/png", name: "Generated image" });
    } else if (item.type === "video" && item.video?.asset_id) {
      videos.push({ assetId: item.video.asset_id, contentType: "video/mp4", name: "Generated video" });
    }
  }
  if (images.length > 0) {
    return { mode: "image_edit", prompt, references: images };
  }
  if (videos.length > 0) {
    return { mode: "retake", prompt, references: videos.slice(0, 1) };
  }
  return { mode: generatedMode === "music" ? "music" : "audio", prompt };
};

/** Create the session's thread in `projectId` and open its tab. Resolves to the thread id. */
export const openCreateSession = async (
  projectId: string,
  options: OpenCreateSessionOptions
): Promise<string> => {
  const title = options.title || CREATE_SESSION_TITLES[options.mode];
  const thread = await trpcClient.threads.create.mutate({
    title,
    project_id: projectId,
    kind: "create"
  });
  const store = useCreateViewStore.getState();
  store.startSession(thread.id, {
    mode: options.mode,
    prompt: options.prompt ?? "",
    references: options.references ?? []
  });
  if (options.title) {
    // A tab named by its caller keeps that name.
    store.markTitled(thread.id);
  }
  useWorkspaceTabsStore.getState().openForegroundTab({
    type: "create",
    ref: thread.id,
    mode: "view",
    title,
    projectId
  });
  void queryClient.invalidateQueries({ queryKey: [["threads"]] });
  return thread.id;
};

/** A tab title from a prompt: its first line, cut to a tab's width. */
export const titleFromPrompt = (prompt: string): string => {
  const line = prompt.trim().split("\n")[0]?.replace(/\s+/g, " ") ?? "";
  return line.length > PROMPT_TITLE_MAX ? `${line.slice(0, PROMPT_TITLE_MAX - 3)}...` : line;
};

/**
 * Name a session after the first prompt it sent, on the thread row and the
 * tab. A session already named keeps its name.
 */
export const nameSessionAfterPrompt = async (
  sessionId: string,
  prompt: string
): Promise<void> => {
  const store = useCreateViewStore.getState();
  if (store.drafts[sessionId]?.titled) {
    return;
  }
  const title = titleFromPrompt(prompt);
  if (!title) {
    return;
  }
  store.markTitled(sessionId);
  useWorkspaceTabsStore.getState().setTitle(sessionId, "create", title);
  await trpcClient.threads.update.mutate({ id: sessionId, title });
  void queryClient.invalidateQueries({ queryKey: [["threads"]] });
};
