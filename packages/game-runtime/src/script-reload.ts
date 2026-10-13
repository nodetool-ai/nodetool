import type { AnyGameDocument } from "@nodetool-ai/protocol";
import { scriptSourceKey, type GameScriptSourceUpdate } from "./scripts.js";
import { digestGame3D } from "./spatial3d/digest.js";

export type GameScriptReloadResult<Document> =
  | { readonly ok: true; readonly changed: boolean; readonly document: Document }
  | { readonly ok: false; readonly error: string };

/** Serializes source-only reloads and commits their document identity with the compiled sources. */
export function createGameScriptReloader<Document extends AnyGameDocument>(options: {
  readonly initialRevision: string;
  readonly current: () => Document;
  readonly parse: (candidate: Document) => Document;
  readonly assertAvailable: () => void;
  /** Snapshot identity may include resolved runtime fields that authored documents cannot store. */
  readonly snapshotDigest?: (document: Document) => Promise<string>;
  readonly commit: (document: Document, updates: readonly GameScriptSourceUpdate[], digest: string) => void;
}): (candidate: Document, signal?: AbortSignal) => Promise<GameScriptReloadResult<Document>> {
  let pending: Promise<unknown> = Promise.resolve();
  return (candidate, signal) => {
    const captured = structuredClone(candidate);
    const task = pending.then(async (): Promise<GameScriptReloadResult<Document>> => {
      try {
        options.assertAvailable();
        signal?.throwIfAborted();
        const current = options.current();
        const parsed = options.parse(captured);
        const normalized = structuredClone(parsed);
        normalized.revision = current.revision;
        const updates: GameScriptSourceUpdate[] = [];
        const compare = (before: AnyGameDocument["scenes"][number]["entities"], after: AnyGameDocument["scenes"][number]["entities"], sceneId: string): void => {
          before.forEach((entity, entityIndex) => {
            const next = after[entityIndex];
            if (next?.id !== entity.id) { return; }
            entity.behaviors.forEach((behavior, index) => {
              const replacement = next.behaviors[index];
              if (behavior.kind === "script" && replacement?.kind === "script") {
                if (behavior.source !== replacement.source) {
                  updates.push({ sourceKey: scriptSourceKey(sceneId, entity.id, index), source: replacement.source });
                  replacement.source = behavior.source;
                }
              }
            });
          });
        };
        current.scenes.forEach((scene, index) => {
          const next = normalized.scenes[index];
          if (next?.id === scene.id) { compare(scene.entities, next.entities, scene.id); }
        });
        if (current.schemaVersion === 3 && normalized.schemaVersion === 3) {
          for (const [id, prefab] of Object.entries(current.prefabs)) {
            const next = normalized.prefabs[id];
            if (next) { compare(prefab.entities, next.entities, `prefab:${id}`); }
          }
        }
        if (await digestGame3D(normalized) !== await digestGame3D(current)) {
          throw new Error("Live reload accepts only existing script source edits. Restart from tick 0 for other changes");
        }
        options.assertAvailable();
        signal?.throwIfAborted();
        if (updates.length === 0) { return { ok: true, changed: false, document: structuredClone(current) }; }
        parsed.revision = options.initialRevision;
        parsed.revision = `script:${await digestGame3D(parsed)}`;
        const digest = await (options.snapshotDigest?.(parsed) ?? digestGame3D(parsed));
        options.assertAvailable();
        signal?.throwIfAborted();
        options.commit(parsed, updates, digest);
        return { ok: true, changed: true, document: structuredClone(parsed) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    pending = task;
    return task;
  };
}
