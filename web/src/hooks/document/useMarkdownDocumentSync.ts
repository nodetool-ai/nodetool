/**
 * useMarkdownDocumentSync
 *
 * Server persistence for one Markdown document open in the document editor
 * (document editor PRD R5, R20 to R22). The document is a text asset: the
 * file is the content, the asset row holds the revision.
 *
 * - Load reads the file, cuts it into blocks and matches the blocks against
 *   the block ids cached in the asset's metadata (R20).
 * - Edits autosave through the shared document sync controller with the
 *   asset's `updated_at` as the compare-and-swap token. Closing the tab
 *   flushes the draft.
 * - A write from outside the editor arrives as a `resource_change`. A clean
 *   editor reloads it, converted against the last saved blocks so unchanged
 *   blocks keep their ids (R22). A dirty editor merges it per block: the
 *   draft wins where both changed a block and the outside value is listed in
 *   the conflict banner (ADR 0001).
 */
import { useEffect, useRef, useState } from "react";
import { CLEAR_HISTORY_COMMAND, type LexicalEditor } from "lexical";
import {
  convertOutsideWrite,
  hashMarkdownBlock,
  identifyBlocks,
  mergeBlockDocuments,
  serializeMarkdownBlocks,
  splitMarkdownBlocks,
  type KnownMarkdownBlock,
  type MarkdownBlockDocument
} from "@nodetool-ai/protocol";

import { queryClient } from "../../queryClient";
import { trpcClient } from "../../trpc/client";
import { useAssetStore } from "../../stores/AssetStore";
import { useConflictStore } from "../../stores/ConflictStore";
import {
  createDocumentSyncController,
  registerDocumentSync,
  type DocumentLoadState,
  type DocumentSyncController
} from "../../stores/documentSync";
import type { MergeConflict } from "../../stores/documentMerge";
import type { Asset } from "../../stores/ApiTypes";
import { newDocumentId } from "../../lib/newDocumentId";
import { normalizeAssetUrls } from "../../utils/normalizeAsset";
import { getErrorMessage } from "../../utils/errorHandling";
import { isPermanentSaveError } from "../../utils/saveErrors";
import { isRecord } from "../../utils/typePredicates";
import type { MarkdownDocumentBinding } from "../../components/documentEditor/markdownBlockCodec";
import {
  diffBlockChanges,
  mergeBlockChanges,
  revertBlockChange,
  type BlockChange
} from "../../components/documentEditor/documentChanges";

/** The asset metadata key that caches block ids between sessions (R20). */
export const DOCUMENT_BLOCKS_METADATA_KEY = "document_blocks";

export type MarkdownSaveStatus = "saved" | "unsaved" | "saving" | "error" | "reloaded";

/** The query key of a text asset's content, shared with the Monaco editor. */
export const textAssetKey = (id: string) => ["textAsset", id] as const;

/** Block ids cached on the asset, or none. */
function storedBlockIds(asset: Asset): KnownMarkdownBlock[] {
  const cache = isRecord(asset.metadata)
    ? asset.metadata[DOCUMENT_BLOCKS_METADATA_KEY]
    : undefined;
  if (!isRecord(cache) || !Array.isArray(cache.blocks)) {
    return [];
  }
  return cache.blocks.flatMap((entry: unknown) =>
    isRecord(entry) && typeof entry.id === "string" && typeof entry.hash === "string"
      ? [{ id: entry.id, hash: entry.hash }]
      : []
  );
}

async function readAsset(id: string): Promise<{ asset: Asset; text: string }> {
  const asset = await useAssetStore.getState().get(id);
  if (!asset.get_url) {
    throw new Error("Document has no download URL");
  }
  const response = await fetch(asset.get_url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load document: ${response.status}`);
  }
  return { asset, text: await response.text() };
}

const isConflict = (error: unknown): boolean =>
  /modified since last read/i.test(getErrorMessage(error));

interface UseMarkdownDocumentSyncResult {
  loadState: DocumentLoadState;
  status: MarkdownSaveStatus;
  /** The asset as last read or saved, for its path and project. */
  asset: Asset | null;
  /** Save the draft now and resolve once the server has it. */
  flush: () => Promise<void>;
  /** Replace the draft with Markdown source, keeping matched block ids (R3). */
  applySource: (source: string) => void;
  /** The draft as Markdown. */
  getSource: () => string;
  /** Blocks an outside write changed, marked until edited or dismissed (R9). */
  changes: BlockChange[];
  /** Undo one marked change as a user edit: revert, remove or restore. */
  revertChange: (blockId: string) => void;
  /** Drop marks without changing the text. No id drops them all. */
  dismissChanges: (blockIds?: readonly string[]) => void;
  /** Take the next outside write without marks, such as a version restore. */
  expectOwnWrite: () => void;
}

export function useMarkdownDocumentSync(
  assetId: string,
  editor: LexicalEditor,
  binding: MarkdownDocumentBinding
): UseMarkdownDocumentSyncResult {
  const [loadState, setLoadState] = useState<DocumentLoadState>("loading");
  const [status, setStatus] = useState<MarkdownSaveStatus>("saved");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [changes, setChanges] = useState<BlockChange[]>([]);
  const changesRef = useRef<BlockChange[]>([]);
  const revertRef = useRef<((blockId: string) => void) | null>(null);
  const ownWriteRef = useRef(false);
  const controllerRef = useRef<DocumentSyncController | null>(null);
  const sourceRef = useRef<{
    apply: (source: string) => void;
    get: () => string;
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    let revision: string | null = null;
    let latest: Asset | null = null;
    /** The blocks the server holds, as far as this editor knows. */
    let base: MarkdownBlockDocument = { leading: "", blocks: [] };
    let editVersion = 0;
    let savedVersion = 0;
    let draftVersion = 0;
    let saving = false;
    const loadStateRef = { current: "loading" as DocumentLoadState };
    const pendingNotices: Array<string | null> = [];
    const conflictKey = `document:${assetId}`;

    const load = (document: MarkdownBlockDocument): void => {
      binding.load(editor, document);
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    };

    const adopt = (next: Asset): void => {
      latest = next;
      revision = next.updated_at ?? null;
      if (!disposed) setAsset(next);
    };

    const isDirty = (): boolean => editVersion !== savedVersion;

    const showChanges = (next: BlockChange[]): void => {
      if (ownWriteRef.current) {
        ownWriteRef.current = false;
        return;
      }
      changesRef.current = next;
      if (!disposed) setChanges(next);
    };

    /** Take a server copy into a clean editor. */
    const reload = async (): Promise<void> => {
      const { asset: next, text } = await readAsset(assetId);
      if (disposed) return;
      if (isDirty()) {
        await mergeExternal(next, text);
        return;
      }
      const converted = convertOutsideWrite(base, text, { kind: "outside" }, newDocumentId);
      const incoming = diffBlockChanges(base, converted.document);
      base = converted.document;
      adopt(next);
      load(converted.document);
      showChanges(mergeBlockChanges(changesRef.current, incoming));
      queryClient.setQueryData(textAssetKey(assetId), text);
      setStatus("reloaded");
    };

    /** Merge a server copy into the dirty draft, per block. */
    const mergeExternal = async (fetched?: Asset, fetchedText?: string): Promise<void> => {
      let next = fetched;
      let text = fetchedText;
      if (!next || text === undefined) {
        ({ asset: next, text } = await readAsset(assetId));
      }
      if (disposed) return;
      const remote = convertOutsideWrite(base, text, { kind: "outside" }, newDocumentId).document;
      const local = binding.serialize(editor.getEditorState());
      const merged = mergeBlockDocuments(base, local, remote);
      // Mark only what landed: a block the draft kept is a conflict instead.
      const landed = new Map(merged.document.blocks.map((block) => [block.id, block.text]));
      const remoteText = new Map(remote.blocks.map((block) => [block.id, block.text]));
      const incoming = diffBlockChanges(base, remote).filter((change) =>
        change.kind === "deleted"
          ? !landed.has(change.blockId)
          : landed.get(change.blockId) === remoteText.get(change.blockId)
      );
      base = merged.nextBase;
      adopt(next);
      load(merged.document);
      showChanges(mergeBlockChanges(changesRef.current, incoming));
      // The draft still differs from the server where it refused a block.
      editVersion++;
      controllerRef.current?.markDirty();
      if (merged.conflicts.length === 0) return;
      const conflicts: MergeConflict[] = merged.conflicts.map((conflict) => ({
        unit: {
          kind: "block",
          id: conflict.blockId,
          label: (conflict.local ?? conflict.external ?? "").split("\n")[0].slice(0, 60) || "Block"
        },
        external: conflict.external,
        draft: conflict.local,
        reason: conflict.reason === "deleted" ? "deleted" : "edited"
      }));
      useConflictStore.getState().addConflicts(conflictKey, conflicts, {
        onAccept: (blockId) => {
          const refused = merged.conflicts.find((conflict) => conflict.blockId === blockId);
          if (!refused) return;
          const draft = binding.serialize(editor.getEditorState());
          const blocks =
            refused.external === null
              ? draft.blocks.filter((block) => block.id !== blockId)
              : draft.blocks.some((block) => block.id === blockId)
                ? draft.blocks.map((block) =>
                    block.id === blockId ? { ...block, text: refused.external ?? "" } : block
                  )
                : [...draft.blocks, ...remote.blocks.filter((block) => block.id === blockId)];
          load({ ...draft, blocks });
          editVersion++;
          controllerRef.current?.markDirty();
        },
        onDiscard: () => {}
      });
    };

    const controller = createDocumentSyncController<MarkdownBlockDocument>({
      getDraft: () => {
        if (loadStateRef.current !== "ready") return null;
        draftVersion = editVersion;
        return binding.serialize(editor.getEditorState());
      },
      getRevision: () => revision,
      isDirty,
      save: async (document, expected) => {
        saving = true;
        try {
          const text = serializeMarkdownBlocks(document);
          // Keep the asset's other metadata: the update replaces the field.
          const metadata: Record<string, unknown> = Object.assign(
            {},
            latest?.metadata ?? undefined
          );
          metadata[DOCUMENT_BLOCKS_METADATA_KEY] = {
            version: 1,
            blocks: document.blocks.map((block) => ({
              id: block.id,
              hash: hashMarkdownBlock(block.text)
            }))
          };
          const raw = await trpcClient.assets.update.mutate({
            id: assetId,
            data: text,
            data_encoding: "utf-8",
            metadata,
            expected_updated_at: expected
          });
          const updated = normalizeAssetUrls(raw);
          useAssetStore.getState().add(updated);
          queryClient.setQueryData(textAssetKey(assetId), text);
          base = document;
          savedVersion = draftVersion;
          adopt(updated);
          const notices = pendingNotices.splice(0, pendingNotices.length);
          if (notices.some((token) => token !== updated.updated_at)) {
            await mergeExternal();
          }
          return { updatedAt: updated.updated_at ?? expected };
        } finally {
          saving = false;
        }
      },
      recoverCasConflict: async () => {
        pendingNotices.splice(0, pendingNotices.length);
        await mergeExternal();
      },
      isCasConflict: isConflict,
      isRetryableError: (error) => !isPermanentSaveError(error),
      onStatus: (next) => {
        if (!disposed) setStatus(next);
      }
    });
    controllerRef.current = controller;

    const unwatchEdits = binding.attach(editor, () => {
      if (loadStateRef.current !== "ready") return;
      editVersion++;
      controller.markDirty();
    });

    const unwatchServer = registerDocumentSync("asset", assetId, {
      localRevision: () => revision,
      isDirty,
      flush: async () => {
        await controller.flush();
      },
      reload: () => {
        void reload().catch((error: unknown) => {
          console.error("Failed to reload document", error);
          if (!disposed) setStatus("error");
        });
      },
      merge: (notice) => {
        // A save in flight may be this notice's own echo; only its response
        // token can tell, so hold the notice until the save settles.
        if (saving) {
          pendingNotices.push(notice.updatedAt);
          return;
        }
        void mergeExternal().catch((error: unknown) => {
          console.error("Failed to merge document", error);
        });
      }
    });

    revertRef.current = (blockId) => {
      const change = changesRef.current.find((entry) => entry.blockId === blockId);
      if (!change || loadStateRef.current !== "ready") return;
      // A revert is the user's own edit: it stays on the undo stack.
      binding.load(editor, revertBlockChange(binding.serialize(editor.getEditorState()), change));
      editVersion++;
      controller.markDirty();
      showChanges(changesRef.current.filter((entry) => entry.blockId !== blockId));
    };

    sourceRef.current = {
      get: () => serializeMarkdownBlocks(binding.serialize(editor.getEditorState())),
      apply: (source) => {
        const current = binding.serialize(editor.getEditorState());
        if (serializeMarkdownBlocks(current) === source) return;
        const converted = convertOutsideWrite(current, source, { kind: "person" }, newDocumentId);
        load(converted.document);
        editVersion++;
        controller.markDirty();
      }
    };

    void (async () => {
      try {
        const { asset: loaded, text } = await readAsset(assetId);
        if (disposed) return;
        const split = splitMarkdownBlocks(text);
        base = {
          leading: split.leading,
          blocks: identifyBlocks(storedBlockIds(loaded), split.blocks, newDocumentId)
        };
        adopt(loaded);
        load(base);
        queryClient.setQueryData(textAssetKey(assetId), text);
        loadStateRef.current = "ready";
        setLoadState("ready");
      } catch (error) {
        console.error("Failed to load document", error);
        if (!disposed) setLoadState("error");
      }
    })();

    return () => {
      disposed = true;
      unwatchServer();
      unwatchEdits();
      // Disposing saves the last draft.
      controller.dispose();
      controllerRef.current = null;
      sourceRef.current = null;
      revertRef.current = null;
      changesRef.current = [];
    };
  }, [assetId, editor, binding]);

  return {
    loadState,
    status,
    asset,
    flush: async () => {
      await controllerRef.current?.flush();
    },
    applySource: (source) => sourceRef.current?.apply(source),
    getSource: () => sourceRef.current?.get() ?? "",
    changes,
    revertChange: (blockId) => revertRef.current?.(blockId),
    expectOwnWrite: () => {
      ownWriteRef.current = true;
    },
    dismissChanges: (blockIds) => {
      const next = blockIds
        ? changesRef.current.filter((change) => !blockIds.includes(change.blockId))
        : [];
      changesRef.current = next;
      setChanges(next);
    }
  };
}

export default useMarkdownDocumentSync;
