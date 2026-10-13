import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { GameDocument, GameDocument3D } from "@nodetool-ai/protocol";

import type { GameScriptLogChannel } from "./gameScriptLogChannel";

type ScriptDocument = GameDocument | GameDocument3D;
interface ReloadSession<D extends ScriptDocument> {
  reloadScripts(document: D, signal?: AbortSignal): Promise<{ ok: true; changed: boolean; document: D } | { ok: false; error: string }>;
  snapshot(): { tick: number };
}

/** Copies only source edits onto the running definition. Structural draft changes wait for restart. */
export function gameSourceEditDocument<D extends ScriptDocument>(current: D, draft: D, blockedEntities: ReadonlySet<string> = new Set()): D {
  if (blockedEntities.has("*")) { return current; }
  let changed = false;
  const copyEntities = <E extends ScriptDocument["scenes"][number]["entities"][number]>(entities: readonly E[], editedEntities: readonly ScriptDocument["scenes"][number]["entities"][number][]): E[] => {
    const edits = new Map(editedEntities.map((entity) => [entity.id, entity]));
    return entities.map((entity) => {
      const edited = edits.get(entity.id);
      const sources = new Set(entity.behaviors.flatMap((behavior) => behavior.kind === "script" ? [behavior.source] : []));
      if (blockedEntities.has(entity.id) || !edited || edited.behaviors.length !== entity.behaviors.length || entity.behaviors.some((behavior, index) => {
        const replacement = edited.behaviors[index];
        return replacement?.kind !== behavior.kind || (replacement.kind === "script" && behavior.kind === "script" &&
          replacement.source !== behavior.source && sources.has(replacement.source));
      })) { return entity; }
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
  readonly blockedEntities?: ReadonlySet<string>;
  readonly lastCommittedTick?: number;
  readonly checkpoint: (session: S) => void;
}

/** Reloads the latest edit on the existing session, without restarting its clock or presentation resources. */
export function useGameScriptReload<D extends ScriptDocument, S extends ReloadSession<D>>({ draft, playDocument, sessionRef,
  effectiveDocumentRef, readyGeneration, scriptLogs, checkpoint, lastCommittedTick = 0, blockedEntities }: GameScriptReloadOptions<D, S>): () => void {
  const tickRef = useRef(lastCommittedTick);
  tickRef.current = lastCommittedTick;
  const controllerRef = useRef<AbortController | null>(null);
  const cancelReload = useCallback(() => controllerRef.current?.abort(), []);
  const checkpointRef = useRef(checkpoint);
  checkpointRef.current = checkpoint;
  useEffect(() => {
    const session = sessionRef.current;
    const effective = effectiveDocumentRef.current;
    if (!draft || !playDocument || !session || !effective) { return; }
    const candidate = gameSourceEditDocument(effective, draft, blockedEntities);
    if (candidate === effective) { return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    void session.reloadScripts(candidate, controller.signal).then((result) => {
      if (controller.signal.aborted || sessionRef.current !== session) { return; }
      if (!result.ok) {
        scriptLogs.publish([{ level: "error", message: `${result.error}. Replay or restart play to apply corrected source.`, tick: tickRef.current }]);
        return;
      }
      effectiveDocumentRef.current = result.document;
      if (result.changed) { checkpointRef.current(session); }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && sessionRef.current === session) {
        scriptLogs.publish([{ level: "error", message: `${cause instanceof Error ? cause.message : String(cause)}. Replay or restart play to apply corrected source.`, tick: tickRef.current }]);
      }
    });
    return () => controller.abort();
  }, [draft, playDocument, readyGeneration, sessionRef, effectiveDocumentRef, scriptLogs, blockedEntities]);
  return cancelReload;
}
