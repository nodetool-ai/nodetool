import { describe, expect, it } from "vitest";

import {
  auditDocumentSyncRepository,
  auditDocumentSyncSources
} from "../check-document-sync-boundary.mjs";

describe("Document sync boundary audit", () => {
  it("accepts the checked repository inventory and inspects source files", async () => {
    const result = await auditDocumentSyncRepository();

    expect(result.inspectedFiles).toBeGreaterThan(0);
    expect(result.counts).toEqual({
      controllers: 5,
      subscribers: 6,
      saveRegistries: 2
    });
    expect(result.violations).toEqual([]);
  }, 15_000);

  it("rejects object and function generic controller calls imported under aliases", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/hooks/rogue/useRogueSync.ts",
        source: `
          import {
            createDocumentSyncController as buildSync
          } from "../../stores/documentSync";
          const first = buildSync<{ value: string }>({});
          const second = buildSync<(value: string) => void>({});
        `
      }
    ]);

    expect(result.violations).toEqual([
      "web/src/hooks/rogue/useRogueSync.ts: constructs a Document sync controller outside the canonical inventory"
    ]);
  });

  it("rejects a controller call through a local value alias", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/hooks/rogue/useRogueSync.ts",
        source: `
          import { createDocumentSyncController } from "../../stores/documentSync";
          const build = createDocumentSyncController;
          build<Draft>({});
        `
      }
    ]);

    expect(result.violations).toEqual([
      "web/src/hooks/rogue/useRogueSync.ts: constructs a Document sync controller outside the canonical inventory"
    ]);
  });

  it("rejects wrapped controller call expressions", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/hooks/rogue/useRogueSync.ts",
        source: `
          import { createDocumentSyncController } from "../../stores/documentSync";
          (createDocumentSyncController)<Draft>({});
          (createDocumentSyncController as typeof createDocumentSyncController)<Draft>({});
          (<typeof createDocumentSyncController>createDocumentSyncController)<Draft>({});
          createDocumentSyncController!<Draft>({});
        `
      }
    ]);

    expect(result.violations).toEqual([
      "web/src/hooks/rogue/useRogueSync.ts: constructs a Document sync controller outside the canonical inventory"
    ]);
  });

  it("rejects namespace imports from the shared module", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/hooks/rogue/useRogueSync.ts",
        source: `
          import * as sync from "../../stores/documentSync";
          sync.createDocumentSyncController<{ value: string }>({});
        `
      }
    ]);

    expect(result.violations).toEqual([
      "web/src/hooks/rogue/useRogueSync.ts: imports the Document sync module through a default or namespace binding"
    ]);
  });

  it("rejects barrel re-exports even when the symbol is renamed", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/hooks/rogue/syncBarrel.ts",
        source: `
          export {
            createDocumentSyncController as makeController
          } from "../../stores/documentSync";
        `
      },
      {
        path: "web/src/hooks/rogue/useRogueSync.ts",
        source: `
          import { makeController as build } from "./syncBarrel";
          build<{ value: string }>({});
        `
      }
    ]);

    expect(result.violations).toEqual([
      "web/src/hooks/rogue/syncBarrel.ts: re-exports the Document sync module through a barrel"
    ]);
  });

  it("allows type-only namespace imports and named re-exports", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/hooks/types.ts",
        source: `import type * as SyncTypes from "../../stores/documentSync";`
      },
      {
        path: "web/src/hooks/typeBarrel.ts",
        source: `
          export {
            type DocumentSyncController as SharedController
          } from "../../stores/documentSync";
        `
      }
    ]);

    expect(result.violations).toEqual([]);
  });

  it("rejects a subscriber imported under an alias", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/hooks/rogue/useRogueSync.ts",
        source: `
          import { registerDocumentSync as watchDocument } from "../../stores/documentSync";
          watchDocument("script", id, subscriber);
        `
      }
    ]);

    expect(result.violations).toEqual([
      "web/src/hooks/rogue/useRogueSync.ts: registers a Document sync subscriber outside the canonical inventory"
    ]);
  });

  it("rejects equivalent declaration and arrow-function save registries", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/hooks/rogue/declarationRegistry.ts",
        source: `
          const pending = new Map();
          export function attachWriter(id: string, writer: () => Promise<void>): void {
            pending.set(id, writer);
          }
          export async function drainWriter(id: string): Promise<void> {
            const writer = pending.get(id);
            await writer?.();
          }
        `
      },
      {
        path: "web/src/hooks/rogue/arrowRegistry.ts",
        source: `
          type PendingSave = { (): Promise<void> };
          const pending = new Map<string, PendingSave>();
          export const registerTimelineSaver = (id: string, save: PendingSave): void => {
            pending.set(id, save);
          };
          export const flushTimelineSave = async (id: string): Promise<void> => {
            await pending.get(id)?.();
          };
        `
      }
    ]);

    expect(result.violations).toEqual([
      "web/src/hooks/rogue/declarationRegistry.ts: declares a parallel Document save registry outside the canonical inventory",
      "web/src/hooks/rogue/arrowRegistry.ts: declares a parallel Document save registry outside the canonical inventory"
    ]);
  });

  it("resolves a save callback type imported from a sibling source", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/hooks/rogue/saveTypes.ts",
        source: `export type PendingWrite = () => Promise<void>;`
      },
      {
        path: "web/src/hooks/rogue/saveRegistry.ts",
        source: `
          import type { PendingWrite } from "./saveTypes";
          const pending = new Map<string, PendingWrite>();
          export function registerSave(id: string, save: PendingWrite): void {
            pending.set(id, save);
          }
          export async function flushSave(id: string): Promise<void> {
            const save = pending.get(id);
            await save?.();
          }
        `
      }
    ]);

    expect(result.violations).toEqual([
      "web/src/hooks/rogue/saveRegistry.ts: declares a parallel Document save registry outside the canonical inventory"
    ]);
  });

  it("does not classify an unrelated asynchronous Map cache as a save registry", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/hooks/useAssetCache.ts",
        source: `
          const cache = new Map<string, Promise<Asset>>();
          export function setCachedAsset(id: string, asset: Promise<Asset>): void {
            cache.set(id, asset);
          }
          export async function loadCachedAsset(id: string): Promise<Asset | undefined> {
            return cache.get(id);
          }
        `
      }
    ]);

    expect(result.violations).toEqual([]);
  });

  it("does not classify an unrelated asynchronous listener Map", () => {
    const result = auditDocumentSyncSources([
      {
        path: "web/src/events/AsyncListeners.ts",
        source: `
          type AsyncListener = () => Promise<void>;
          const listeners = new Map<string, AsyncListener>();
          export function addListener(id: string, listener: AsyncListener): void {
            listeners.set(id, listener);
          }
          export async function dispatch(id: string): Promise<void> {
            const listener = listeners.get(id);
            await listener?.();
          }
        `
      }
    ]);

    expect(result.violations).toEqual([]);
  });
});
