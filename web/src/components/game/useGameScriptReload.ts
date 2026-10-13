import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { GameDocument, GameDocument3D } from "@nodetool-ai/protocol";

import type { GameScriptLogChannel } from "./gameScriptLogChannel";

type ScriptDocument = GameDocument | GameDocument3D;
interface ReloadSession<D extends ScriptDocument> {
  reloadScripts(document: D, signal?: AbortSignal): Promise<{ ok: true; changed: boolean; document: D } | { ok: false; error: string }>;
  snapshot(): { tick: number };
}

/** Copies only source edits onto the running definition. Structural draft changes wait for restart. */
export function gameSourceEditDocument<D extends ScriptDocument>(current: D, draft: D): D {
  let changed = false;
  const copyEntities = <E extends ScriptDocument["scenes"][number]["entities"][number]>(entities: readonly E[], editedEntities: readonly ScriptDocument["scenes"][number]["entities"][number][]): E[] => {
    const edits = new Map(editedEntities.map((entity) => [entity.id, entity]));
    return entities.map((entity) => {
      const edited = edits.get(entity.id);
      return { ...entity, behaviors: entity.behaviors.map((behavior, index) => {
        const replacement = edited?.behaviors[index];
        if (behavior.kind !== "script" || replacement?.kind !== "script" || behavior.source === replacement.source) { return behavior; }
        changed = true;
        return { ...behavior, source: replacement.source };
      }) };
    });
  };
  const edits = new Map(draft.scenes.map((scene) => [scene.id, scene]));
  const scenes = current.scenes.map((scene) => ({ ...scene, entities: copyEntities<ScriptDocument["scenes"][number]["entities"][number]>(scene.entities, edits.get(scene.id)?.entities ?? []) }));
  if (current.schemaVersion === 3 && draft.schemaVersion === 3) {
    const prefabs = Object.fromEntries(Object.entries(current.prefabs).map(([id, prefab]) =>
      [id, { ...prefab, entities: copyEntities(prefab.entities, draft.prefabs[id]?.entities ?? []) }]));
    return changed ? { ...current, scenes, prefabs } : current;
  }
  return changed ? { ...current, scenes } : current;
}

interface GameScriptReloadOptions<D extends ScriptDocument, S extends ReloadSession<D>> {
  readonly draft: D | null;
  readonly playDocument: D | null;
  readonly sessionRef: MutableRefObject<S | null>;
  readonly effectiveDocumentRef: MutableRefObject<D | null>;
  readonly readyGeneration: number;
  readonly scriptLogs: GameScriptLogChannel;
  readonly checkpoint: (session: S) => void;
}

/** Reloads the latest edit on the existing session, without restarting its clock or presentation resources. */
export function useGameScriptReload<D extends ScriptDocument, S extends ReloadSession<D>>({ draft, playDocument, sessionRef,
  effectiveDocumentRef, readyGeneration, scriptLogs, checkpoint }: GameScriptReloadOptions<D, S>): () => void {
  const controllerRef = useRef<AbortController | null>(null);
  const cancelReload = useCallback(() => controllerRef.current?.abort(), []);
  const checkpointRef = useRef(checkpoint);
  checkpointRef.current = checkpoint;
  useEffect(() => {
    const session = sessionRef.current;
    const effective = effectiveDocumentRef.current;
    if (!draft || !playDocument || !session || !effective) { return; }
    const candidate = gameSourceEditDocument(effective, draft);
    if (candidate === effective) { return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    void session.reloadScripts(candidate, controller.signal).then((result) => {
      if (controller.signal.aborted || sessionRef.current !== session) { return; }
      if (!result.ok) {
        scriptLogs.publish([{ level: "error", message: result.error, tick: session.snapshot().tick }]);
        return;
      }
      effectiveDocumentRef.current = result.document;
      if (result.changed) { checkpointRef.current(session); }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && sessionRef.current === session) {
        scriptLogs.publish([{ level: "error", message: cause instanceof Error ? cause.message : String(cause), tick: session.snapshot().tick }]);
      }
    });
    return () => controller.abort();
  }, [draft, playDocument, readyGeneration, sessionRef, effectiveDocumentRef, scriptLogs]);
  return cancelReload;
}
