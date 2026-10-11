/**
 * `Add your own style` (PRD § 7.3, § 7.7.9).
 *
 * One to three reference images go to the board's language model, which
 * answers with a name and a descriptor for the look. The first reference is
 * uploaded and becomes the entity's own image, so the new style shows the same
 * kind of tile as a shipped preset, and the entity is applied with the same
 * `setStylePreset` a preset uses — one style on the board, one undo step.
 *
 * The shipped presets are system rows every user reads: this only ever creates
 * a new entity. A preset the board was already on lends its name to the copy
 * and is never written to.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { Entity } from "@nodetool-ai/protocol";

import { rpcRequest } from "../../../lib/websocket/rpcRequest";
import { isRecord, isString } from "../../../utils/typePredicates";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useAssetUpload } from "../../../serverState/useAssetUpload";
import { useEntities, useSaveEntity } from "../../../serverState/useEntities";
import {
  MAX_STYLE_REFERENCES,
  STYLE_DESCRIPTOR_SCHEMA,
  STYLE_DESCRIPTOR_SYSTEM_PROMPT,
  STYLE_DESCRIPTOR_TOOL_DESCRIPTION,
  STYLE_DESCRIPTOR_TOOL_NAME,
  buildStyleDescriptorContent,
  buildUserStyle,
  type StyleSource
} from "../../../lib/storyboard/userStyle";

export { MAX_STYLE_REFERENCES };

/** What the reference picker offers. */
export const STYLE_ACCEPT = "image/*";

const readDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

/** Upload one reference so the new style has an image of its own. */
const uploadReference = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    useAssetUpload.getState().uploadAsset({
      file,
      onCompleted: (asset) => resolve(asset.id),
      onFailed: (message) => reject(new Error(message))
    });
  });

// Boards with a style save in flight. Module state rather than component
// state, so the flow's Look button can hold until the save lands and applies
// its style (F8).
const savingBoards = new Set<string>();
const savingListeners = new Set<() => void>();
const setBoardSaving = (boardId: string, saving: boolean): void => {
  if (saving) {
    savingBoards.add(boardId);
  } else {
    savingBoards.delete(boardId);
  }
  for (const listener of savingListeners) {
    listener();
  }
};
const subscribeSaving = (listener: () => void): (() => void) => {
  savingListeners.add(listener);
  return () => {
    savingListeners.delete(listener);
  };
};

/** True while a custom style is being saved for this board. */
export function useStyleSaving(boardId: string): boolean {
  return useSyncExternalStore(
    subscribeSaving,
    useCallback(() => savingBoards.has(boardId), [boardId])
  );
}

export interface CustomStyleResult {
  saving: boolean;
  error: string | null;
  clearError: () => void;
  /** Describes the references, saves the style, applies it. Never throws. */
  addStyle: (files: readonly File[]) => Promise<boolean>;
  /**
   * Stops the save in flight. The style is not applied, and Generate is free
   * again at once.
   */
  cancel: () => void;
}

export function useCustomStyle(boardId: string): CustomStyleResult {
  const [saving, setSaving] = useState(false);
  // `saving` reaches the dialog a render later than the click, so a second
  // press inside that window used to start a second model call, a second
  // upload and a second entity. The ref closes the window (F18).
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // The save in flight. The descriptor call has no timeout, so without a way
  // to stop it a reply that never came held Generate forever.
  const controllerRef = useRef<AbortController | null>(null);
  const { data: entities } = useEntities();
  const saveEntity = useSaveEntity();

  const cancel = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) {
      return;
    }
    controller.abort();
    controllerRef.current = null;
    inFlight.current = false;
    setSaving(false);
    setBoardSaving(boardId, false);
  }, [boardId]);

  const addStyle = useCallback(
    async (files: readonly File[]): Promise<boolean> => {
      if (inFlight.current) {
        return false;
      }
      setError(null);
      const references = files.slice(0, MAX_STYLE_REFERENCES);
      if (references.length === 0) {
        setError("Pick at least one reference image.");
        return false;
      }
      const board = useStoryboardStore.getState().getBoard(boardId);
      const model = board?.directorModel;
      if (!model?.id) {
        setError("Pick a model before adding a style.");
        return false;
      }

      inFlight.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;
      const { signal } = controller;
      setSaving(true);
      setBoardSaving(boardId, true);
      try {
        const uris = await Promise.all(references.map(readDataUri));
        const answer = await rpcRequest(
          "generate_text",
          {
            provider: model.provider,
            model: model.id,
            messages: [
              { role: "system", content: STYLE_DESCRIPTOR_SYSTEM_PROMPT },
              { role: "user", content: buildStyleDescriptorContent(uris) }
            ],
            max_tokens: 1024,
            schema: STYLE_DESCRIPTOR_SCHEMA,
            schema_name: STYLE_DESCRIPTOR_TOOL_NAME,
            schema_description: STYLE_DESCRIPTOR_TOOL_DESCRIPTION
          },
          undefined,
          signal
        );
        if (signal.aborted) {
          return false;
        }
        const data = isRecord(answer.data) ? answer.data : {};
        // The style the board is on, read for its name only (§ 7.7.9).
        const current: StyleSource | null =
          (entities ?? [])
            .filter((entity) => entity.kind === "style")
            .find((entity) => board?.entityIds.includes(entity.id)) ?? null;
        const draft = buildUserStyle(
          {
            name: isString(data.name) ? data.name : undefined,
            descriptor: isString(data.descriptor) ? data.descriptor : undefined
          },
          current
        );
        if (!draft) {
          setError("The model did not describe these references.");
          return false;
        }

        const assetId = await uploadReference(references[0]);
        if (signal.aborted) {
          return false;
        }
        const entity: Entity | null = await saveEntity.mutateAsync({
          assetId,
          kind: "style",
          name: draft.name,
          descriptor: draft.descriptor
        });
        if (signal.aborted) {
          return false;
        }
        if (!entity) {
          setError("The style could not be saved.");
          return false;
        }
        // The new entity is not in the query's cache yet, so it is handed to
        // the store directly — the same list a preset tile passes.
        useStoryboardStore
          .getState()
          .setStylePreset(boardId, entity.id, [...(entities ?? []), entity]);
        return true;
      } catch (cause) {
        if (signal.aborted) {
          return false;
        }
        setError(
          cause instanceof Error ? cause.message : "The style could not be made."
        );
        return false;
      } finally {
        // A canceled save already released everything, and a newer one may
        // be running now.
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          inFlight.current = false;
          setSaving(false);
          setBoardSaving(boardId, false);
        }
      }
    },
    [boardId, entities, saveEntity]
  );

  return {
    saving,
    error,
    clearError: useCallback(() => setError(null), []),
    addStyle,
    cancel
  };
}

export default useCustomStyle;
