/**
 * `Add your own style` on the Game flow's Look step (game-prd § 4.3).
 *
 * The storyboard flow's `AddStyleDialog` is reused as-is; only what happens on
 * submit differs. The storyboard's own `useCustomStyle` writes through the
 * board store, and the Game flow has no board — so the same three moves are
 * made here against the workflow instead: describe the references with the
 * designer model, upload the first one so the new style has a tile of its own,
 * save the entity, and hand its id back for `style_entity_id`.
 *
 * The shipped presets are system rows every user reads: this only ever creates
 * a new entity.
 */

import { useCallback, useRef, useState } from "react";
import type { Entity } from "@nodetool-ai/protocol";

import { rpcRequest } from "../../../lib/websocket/rpcRequest";
import { isRecord, isString } from "../../../utils/typePredicates";
import { useAssetUpload } from "../../../serverState/useAssetUpload";
import { useSaveEntity } from "../../../serverState/useEntities";
import {
  MAX_STYLE_REFERENCES,
  STYLE_DESCRIPTOR_SCHEMA,
  STYLE_DESCRIPTOR_SYSTEM_PROMPT,
  STYLE_DESCRIPTOR_TOOL_DESCRIPTION,
  STYLE_DESCRIPTOR_TOOL_NAME,
  buildStyleDescriptorContent,
  buildUserStyle
} from "../../../lib/storyboard/userStyle";

/** What the descriptor call is allowed to answer with. */
const STYLE_MAX_OUTPUT_TOKENS = 1024;

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

export interface GameCustomStyleResult {
  saving: boolean;
  error: string | null;
  clearError: () => void;
  /** Describes the references and saves the style. Never throws. */
  addStyle: (files: readonly File[]) => Promise<boolean>;
}

export interface GameCustomStyleOptions {
  /** The model that reads the references — the flow's designer model. */
  model: { provider: string; id: string } | null;
  /** Applies the saved style: writes `style_entity_id`. */
  onApply: (entity: Entity) => void;
}

export function useGameCustomStyle({
  model,
  onApply
}: GameCustomStyleOptions): GameCustomStyleResult {
  const [saving, setSaving] = useState(false);
  // `saving` reaches the dialog a render later than the click, so a second
  // press inside that window would start a second model call, a second upload
  // and a second entity. The ref closes the window.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const saveEntity = useSaveEntity();

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
      if (!model?.id) {
        setError("Pick a model before adding a style.");
        return false;
      }

      inFlight.current = true;
      setSaving(true);
      try {
        const uris = await Promise.all(references.map(readDataUri));
        const answer = await rpcRequest("generate_text", {
          provider: model.provider,
          model: model.id,
          messages: [
            { role: "system", content: STYLE_DESCRIPTOR_SYSTEM_PROMPT },
            { role: "user", content: buildStyleDescriptorContent(uris) }
          ],
          max_tokens: STYLE_MAX_OUTPUT_TOKENS,
          schema: STYLE_DESCRIPTOR_SCHEMA,
          schema_name: STYLE_DESCRIPTOR_TOOL_NAME,
          schema_description: STYLE_DESCRIPTOR_TOOL_DESCRIPTION
        });
        const data = isRecord(answer.data) ? answer.data : {};
        const draft = buildUserStyle(
          {
            name: isString(data.name) ? data.name : undefined,
            descriptor: isString(data.descriptor) ? data.descriptor : undefined
          },
          null
        );
        if (!draft) {
          setError("The model did not describe these references.");
          return false;
        }

        const assetId = await uploadReference(references[0]);
        const entity: Entity | null = await saveEntity.mutateAsync({
          assetId,
          kind: "style",
          name: draft.name,
          descriptor: draft.descriptor
        });
        if (!entity) {
          setError("The style could not be saved.");
          return false;
        }
        onApply(entity);
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The style could not be made."
        );
        return false;
      } finally {
        inFlight.current = false;
        setSaving(false);
      }
    },
    [model, onApply, saveEntity]
  );

  return {
    saving,
    error,
    clearError: useCallback(() => setError(null), []),
    addStyle
  };
}

export default useGameCustomStyle;
