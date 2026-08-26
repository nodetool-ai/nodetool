/**
 * useScriptServerSync
 *
 * Server persistence for one script tab. On mount: load the script's server
 * document into the store (or upsert-create it when the tab refs a script the
 * server doesn't know — new tabs). After load: watch the store and autosave
 * with a debounce, using the server's `updatedAt` as a CAS token
 * (`baseUpdatedAt`). On a conflict the server copy wins and is reloaded.
 *
 * Copied from useStoryboardServerSync — same machinery, script payload.
 */

import { useEffect, useRef, useState } from "react";
import { trpc, trpcClient } from "../../trpc/client";
import {
  useScriptStore,
  type ScriptDraft,
  type ScriptStoreState,
  type ScriptSaveStatus
} from "../../stores/script/ScriptStore";
import type { DocumentOp } from "@nodetool-ai/protocol";
import { getErrorMessage } from "../../utils/errorHandling";
import {
  registerDocumentSync,
  type DocumentLoadState
} from "../../stores/documentSync";
import { mergeScriptDocuments } from "../../stores/script/merge";
import type { MergeConflict } from "../../stores/documentMerge";
import { useConflictStore } from "../../stores/ConflictStore";
import {
  isPermanentSaveError,
  MAX_TRANSIENT_SAVE_RETRIES
} from "../../utils/saveErrors";

const AUTOSAVE_DEBOUNCE_MS = 750;
const RETRY_DELAY_MS = 5_000;

type ScriptResponse = Awaited<ReturnType<typeof trpcClient.scripts.get.query>>;
type ScriptWireDocument = ScriptResponse["document"];

/** The saved payload: the script minus identity and transient UI state. */
const scriptToDocument = (script: ScriptDraft): ScriptWireDocument => ({
  cast: script.cast,
  sections: script.sections
});

const responseToScript = (
  res: ScriptResponse
): Omit<ScriptDraft, "id" | "updatedAt"> => {
  const doc = res.document;
  return {
    title: res.name === "Untitled script" ? "" : res.name,
    cast: doc.cast,
    sections: doc.sections,
    timelineId: res.timelineId ?? null,
    storyboardId: res.storyboardId ?? null
  };
};

const isNotFound = (error: unknown): boolean =>
  /not found/i.test(getErrorMessage(error));

const isConflict = (error: unknown): boolean =>
  /modified since last read/i.test(getErrorMessage(error));

/** The part of a `resource_change` notice this hook reads. */
interface ExternalNotice {
  updatedAt: string | null;
  ops?: DocumentOp[];
}

/** Store actions the line/take conflict resolvers need. */
type LineTakeStoreActions = Pick<
  ScriptStoreState,
  "patchLine" | "setSectionLines" | "removeTake"
>;

/** The section of `sections` holding `lineId`, if any. */
const sectionHoldingLine = (
  sections: ScriptDraft["sections"],
  lineId: string
): { section: ScriptDraft["sections"][number]; index: number } | null => {
  for (const section of sections) {
    const index = section.lines.findIndex((line) => line.id === lineId);
    if (index !== -1) return { section, index };
  }
  return null;
};

/**
 * Take one refused external line into the draft. A line the draft still
 * holds is patched field by field (its takes stay as merged); a line the
 * draft deleted is re-inserted where the server had it.
 */
function acceptLine(
  scriptId: string,
  draft: ScriptDraft,
  unitId: string,
  incoming: ScriptDraft["sections"][number]["lines"][number] | null,
  serverScript: ScriptDraft,
  actions: LineTakeStoreActions
): void {
  if (!incoming) return;
  const held = sectionHoldingLine(draft.sections, incoming.id);
  if (held) {
    const { id: _id, takes: _takes, ...fields } = incoming;
    actions.patchLine(scriptId, incoming.id, fields);
    return;
  }
  // The draft deleted it: restore into the server's slot.
  const serverPlacement = sectionHoldingLine(serverScript.sections, incoming.id);
  const target =
    serverPlacement &&
    draft.sections.find((section) => section.id === serverPlacement.section.id);
  if (!target) return;
  const lines = [...target.lines];
  lines.splice(Math.min(serverPlacement.index, lines.length), 0, incoming);
  actions.setSectionLines(scriptId, target.id, lines);
}

/**
 * Take one refused external take into the line that holds it, replacing in
 * place; a take the draft dropped returns onto the same line by id.
 */
function acceptTake(
  scriptId: string,
  draft: ScriptDraft,
  takeId: string,
  incoming: ScriptDraft["sections"][number]["lines"][number]["takes"][number],
  serverScript: ScriptDraft,
  actions: LineTakeStoreActions
): void {
  for (const section of draft.sections) {
    const line = section.lines.find((l) => l.takes.some((t) => t.id === takeId));
    if (!line) continue;
    const lines = section.lines.map((candidate) =>
      candidate.id === line.id
        ? {
            ...candidate,
            takes: candidate.takes.map((t) => (t.id === takeId ? incoming : t))
          }
        : candidate
    );
    actions.setSectionLines(scriptId, section.id, lines);
    return;
  }
  // Not in the draft: put it back on the line that holds it on the server.
  for (const serverSection of serverScript.sections) {
    const serverLine = serverSection.lines.find((l) =>
      l.takes.some((t) => t.id === takeId)
    );
    if (!serverLine) continue;
    const draftSection = draft.sections.find((s) => s.id === serverSection.id);
    if (!draftSection) continue;
    const draftLine = draftSection.lines.find((l) => l.id === serverLine.id);
    if (!draftLine) continue;
    const lines = draftSection.lines.map((candidate) =>
      candidate.id === draftLine.id
        ? { ...candidate, takes: [...candidate.takes, incoming] }
        : candidate
    );
    actions.setSectionLines(scriptId, draftSection.id, lines);
    return;
  }
}

/** Drop one refused-take deletion: remove it from whichever line holds it. */
function removeTakeById(
  scriptId: string,
  draft: ScriptDraft,
  takeId: string,
  actions: LineTakeStoreActions
): void {
  for (const section of draft.sections) {
    const line = section.lines.find((l) => l.takes.some((t) => t.id === takeId));
    if (!line) continue;
    actions.removeTake(scriptId, line.id, takeId);
    return;
  }
}

export const useScriptServerSync = (
  scriptId: string
): DocumentLoadState => {
  const utils = trpc.useUtils();
  const [loadState, setLoadState] = useState<DocumentLoadState>("loading");
  const syncedRef = useRef<ScriptDraft | null>(null);
  const revisionRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const flushAfterSaveRef = useRef(false);
  // Consecutive failed attempts for the current edit. Reset by a new edit and
  // by a save that lands.
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  useEffect(() => {
    let disposed = false;
    const store = useScriptStore;
    setLoadState("loading");

    // Notices that arrived while a save was in flight. One of them may be that
    // save's own echo, which only the save's response token identifies; the
    // rest are foreign writes and are handled once the save settles.
    const pendingNotices: ExternalNotice[] = [];

    const isDirty = (): boolean =>
      (store.getState().scripts[scriptId] ?? null) !== syncedRef.current;

    // `statusAfter` is applied only once the server copy has actually replaced
    // the local one, so the indicator never claims a state before it's true.
    const applyResponse = (
      res: ScriptResponse,
      statusAfter: ScriptSaveStatus | null
    ): void => {
      if (disposed) return;
      store.getState().loadScript(scriptId, responseToScript(res));
      revisionRef.current = res.updatedAt;
      store.getState().setServerRevision(scriptId, res.updatedAt);
      syncedRef.current = store.getState().scripts[scriptId] ?? null;
      if (statusAfter) store.getState().setSaveStatus(scriptId, statusAfter);
    };

    // `statusAfter` is the status to set once the load lands. Mount load →
    // "saved" (clearing a stale error from a previous session); the CAS-conflict
    // reload → "reloaded", set post-replacement so a slow reload can't claim it
    // early. A load that never applies (early error) sets nothing.
    const load = async (
      statusAfter: ScriptSaveStatus | null = "saved"
    ): Promise<void> => {
      try {
        applyResponse(
          await trpcClient.scripts.get.query({ id: scriptId }),
          statusAfter
        );
      } catch (error) {
        if (!isNotFound(error)) {
          console.error("Failed to load script", error);
          // A failed load (e.g. a CAS-conflict reload that couldn't fetch) must
          // not leave the status stuck on the "saving" it was set to — surface
          // the failure.
          store.getState().setSaveStatus(scriptId, "error");
          return;
        }
        // Unknown to the server: upsert-create carrying any local content.
        const local = store.getState().scripts[scriptId];
        try {
          const created = await trpcClient.scripts.create.mutate({
            id: scriptId,
            name: local?.title || "Untitled script",
            document: local ? scriptToDocument(local) : undefined
          });
          if (disposed) return;
          revisionRef.current = created.updatedAt;
          store.getState().setServerRevision(scriptId, created.updatedAt);
          syncedRef.current = store.getState().scripts[scriptId] ?? null;
          if (statusAfter) store.getState().setSaveStatus(scriptId, statusAfter);
          void utilsRef.current.scripts.list.invalidate();
        } catch (createError) {
          console.error("Failed to create script", createError);
          store.getState().setSaveStatus(scriptId, "error");
        }
      }
    };

    const save = async (flush = false): Promise<void> => {
      if (inFlightRef.current) {
        if (flush) flushAfterSaveRef.current = true;
        return;
      }
      if (disposed && !flush) return;
      const script = store.getState().scripts[scriptId];
      const revision = store.getState().serverRevisions[scriptId];
      if (!script || !revision || script === syncedRef.current) return;

      inFlightRef.current = true;
      let saved = false;
      // The token our own write came back with, so its echo can be told apart
      // from a foreign notice buffered during the same window.
      let ownToken: string | null = null;
      let casConflict = false;
      store.getState().setSaveStatus(scriptId, "saving");
      try {
        const updated = await trpcClient.scripts.update.mutate({
          id: scriptId,
          baseUpdatedAt: revision,
          name: script.title || "Untitled script",
          document: scriptToDocument(script),
          timelineId: script.timelineId,
          storyboardId: script.storyboardId
        });
        revisionRef.current = updated.updatedAt;
        ownToken = updated.updatedAt;
        store.getState().setServerRevision(scriptId, updated.updatedAt);
        syncedRef.current = script;
        saved = true;
        retriesRef.current = 0;
        void utilsRef.current.scripts.list.invalidate();
        // Only claim "saved" when the saved snapshot still matches the store.
        // Edits that landed mid-flight leave newer work queued, so keep the
        // "unsaved" state (the subscriber already set it) and go again rather
        // than flashing a false "Saved".
        if (store.getState().scripts[scriptId] !== syncedRef.current) {
          store.getState().setSaveStatus(scriptId, "unsaved");
          if (disposed || flushAfterSaveRef.current) {
            flushAfterSaveRef.current = true;
          } else {
            schedule();
          }
        } else {
          store.getState().setSaveStatus(scriptId, "saved");
        }
      } catch (error) {
        console.error("Script autosave failed", error);
        // Tab unmounted mid-flush: no live hook remains to retry or reload, but
        // don't leave the singleton status stuck on "saving" — mark it failed so
        // reopening the script shows the truth. The next mount reconciles.
        if (disposed) {
          store.getState().setSaveStatus(scriptId, "error");
          return;
        }
        if (isConflict(error)) {
          // Recovered below, once the in-flight flag is down: a dirty draft
          // merges the newer server copy instead of being reloaded over.
          casConflict = true;
        } else {
          store.getState().setSaveStatus(scriptId, "error");
          // A payload the server will reject again — an invalid document, a
          // permission error — must not be resent, and even a transient
          // failure gets a bounded number of retries rather than a loop.
          if (
            !isPermanentSaveError(error) &&
            retriesRef.current < MAX_TRANSIENT_SAVE_RETRIES
          ) {
            retriesRef.current += 1;
            schedule(RETRY_DELAY_MS);
          } else {
            retriesRef.current = 0;
          }
        }
      } finally {
        inFlightRef.current = false;
        if (!disposed && (pendingNotices.length > 0 || casConflict)) {
          await drainPendingNotices(ownToken);
          if (casConflict) await recoverFromConflict();
        }
        if (saved && flushAfterSaveRef.current) {
          flushAfterSaveRef.current = false;
          void save(true);
        }
      }
    };

    const schedule = (delayMs: number = AUTOSAVE_DEBOUNCE_MS): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void save();
      }, delayMs);
    };

    const unsubscribe = store.subscribe((state, prev) => {
      if (state.scripts[scriptId] === prev.scripts[scriptId]) return;
      if (state.scripts[scriptId] === syncedRef.current) return;
      if (!state.serverRevisions[scriptId]) return;
      // Edits landed; the debounced save hasn't fired yet. Reflect the pending
      // state so "saved" never lies during the debounce window. (Setting status
      // only touches saveStatus, so this subscriber early-returns on it.)
      store.getState().setSaveStatus(scriptId, "unsaved");
      // A new edit is new content: give it a full retry budget.
      retriesRef.current = 0;
      schedule();
    });

    // Writes from outside this browser (agent doc-ops, CLI, another tab) come
    // in as `resource_change`. A clean tab takes the server copy; a dirty one
    // merges the change per merge unit — draft wins, refused values land in
    // the conflict banner, no undo entry for external work (ADR 0001).
    const mergeExternal = async (
      notice: ExternalNotice,
      prefetched?: ScriptResponse
    ): Promise<void> => {
      let res: ScriptResponse;
      if (prefetched) {
        res = prefetched;
      } else {
        try {
          res = await trpcClient.scripts.get.query({ id: scriptId });
        } catch (error) {
          console.error("Failed to fetch script for merge", error);
          return;
        }
      }
      if (disposed) return;
      const base = syncedRef.current;
      const draft = store.getState().scripts[scriptId];
      if (!base || !draft || base === draft) return;

      const serverScript: ScriptDraft = {
        ...responseToScript(res),
        id: scriptId,
        updatedAt: Date.now()
      };

      const { doc: merged, conflicts } = mergeScriptDocuments(
        base,
        draft,
        serverScript,
        notice.ops
      );
      // SAFETY: `ScriptMergeDoc` is the merge engine's view of a script —
      // the same fields, with the unit collections widened to `unknown[]`
      // so the engine can carry them. The engine writes a collection back by
      // spreading the document it was given, so every other field of `draft`
      // survives; re-typing them is what makes the result a `ScriptDraft`
      // again.
      store.getState().applyMerged(
        scriptId,
        merged as unknown as ScriptDraft
      );
      revisionRef.current = res.updatedAt;
      store.getState().setServerRevision(scriptId, res.updatedAt);
      syncedRef.current = serverScript;

      const listed = conflicts.map((conflict) =>
        conflict.unit.id
          ? conflict
          : { ...conflict, unit: { ...conflict.unit, id: conflict.unit.kind } }
      );
      useConflictStore.getState().setConflicts(`script:${scriptId}`, listed, {
        onAccept: (unitId) => {
          const entry = useConflictStore.getState().byKey[`script:${scriptId}`];
          const conflict = entry?.conflicts.find((c) => c.unit.id === unitId);
          if (!conflict) return;
          acceptConflict(conflict, serverScript);
        },
        onDiscard: () => {}
      });
    };

    /**
     * Handle the notices buffered during a save now that it has settled.
     * `ownToken` is the `updated_at` the save's own response carried, so the
     * echo of this write can be told apart from a foreign one; a save that
     * never landed has no token and every buffered notice is foreign.
     */
    const drainPendingNotices = async (
      ownToken: string | null
    ): Promise<void> => {
      const notices = pendingNotices.splice(0, pendingNotices.length);
      for (const notice of notices) {
        if (disposed) return;
        if (notice.updatedAt && notice.updatedAt === ownToken) continue;
        if (notice.updatedAt && notice.updatedAt === revisionRef.current) {
          continue;
        }
        if (!isDirty()) {
          await load("reloaded");
          continue;
        }
        await mergeExternal(notice);
      }
    };

    /**
     * Recover from a CAS rejection without dropping the draft. A clean editor
     * takes the server copy. A dirty one re-reads: when the server holds
     * exactly the revision this editor already merged, the save merely raced
     * that merge and is retried with the current token; otherwise the newer
     * server copy is merged in (no ops, so a whole-document `replaced`
     * conflict) and the save is rescheduled.
     */
    const recoverFromConflict = async (): Promise<void> => {
      if (!isDirty()) {
        // Set "reloaded" only after the server copy is applied, not before.
        await load("reloaded");
        return;
      }
      let res: ScriptResponse;
      try {
        res = await trpcClient.scripts.get.query({ id: scriptId });
      } catch (error) {
        console.error("Failed to re-read script after a conflict", error);
        store.getState().setSaveStatus(scriptId, "error");
        return;
      }
      if (disposed) return;
      if (res.updatedAt !== revisionRef.current) {
        await mergeExternal({ updatedAt: res.updatedAt }, res);
        if (disposed) return;
      }
      store.getState().setSaveStatus(scriptId, "unsaved");
      schedule();
    };

    /** Take one refused external value into the draft (an undoable edit). */
    const acceptConflict = (
      conflict: MergeConflict,
      serverScript: ScriptDraft
    ): void => {
      const s = store.getState();
      const draft = s.scripts[scriptId];
      if (!draft) return;
      if (conflict.reason === "replaced") {
        s.loadScript(scriptId, serverScript, { checkpoint: true });
        return;
      }
      if (conflict.unit.kind === "speaker" && conflict.external != null) {
        s.updateSpeaker(
          scriptId,
          conflict.unit.id,
          conflict.external as Record<string, unknown>
        );
        return;
      }
      if (conflict.reason === "deleted" && conflict.external === null) {
        if (conflict.unit.kind === "speaker") {
          s.removeSpeaker(scriptId, conflict.unit.id);
        } else if (conflict.unit.kind === "line") {
          s.removeLine(scriptId, conflict.unit.id);
        } else if (conflict.unit.kind === "take") {
          removeTakeById(scriptId, draft, conflict.unit.id, s);
        }
        return;
      }
      if (conflict.unit.kind === "line") {
        acceptLine(
          scriptId,
          draft,
          conflict.unit.id,
          conflict.external as ScriptDraft["sections"][number]["lines"][number] | null,
          serverScript,
          s
        );
        return;
      }
      if (
        conflict.unit.kind === "take" &&
        conflict.external != null
      ) {
        acceptTake(
          scriptId,
          draft,
          conflict.unit.id,
          conflict.external as ScriptDraft["sections"][number]["lines"][number]["takes"][number],
          serverScript,
          s
        );
        return;
      }
      if (conflict.unit.kind === "section") {
        // Take the server's section fields; the lines merged per line and
        // stay as the draft holds them.
        const incoming = conflict.external as Record<string, unknown> | null;
        if (!incoming) return;
        const { lines: _lines, ...rest } = incoming;
        if (!draft.sections.some((section) => section.id === conflict.unit.id)) {
          return;
        }
        s.patchSection(
          scriptId,
          conflict.unit.id,
          rest as Partial<
            Omit<ScriptDraft["sections"][number], "id" | "lines">
          >
        );
        return;
      }
      if (conflict.unit.kind === "field" && conflict.unit.id === "title") {
        s.setTitle(scriptId, serverScript.title);
      }
    };

    const unwatch = registerDocumentSync("script", scriptId, {
      localRevision: () => revisionRef.current,
      isDirty: () =>
        (store.getState().scripts[scriptId] ?? null) !== syncedRef.current,
      reload: () => {
        void load("reloaded");
      },
      merge: (notice) => {
        // A save in flight makes the notice ambiguous: it may be that save's
        // own echo, and only the save's response token says so. Hold it until
        // then rather than guessing — guessing hides another tab's write and
        // rolls the revision to a token we never received.
        if (inFlightRef.current) {
          pendingNotices.push({ updatedAt: notice.updatedAt, ops: notice.ops });
          return;
        }
        void mergeExternal(notice);
      }
    });

    // The initial load gates rendering: a script with no server revision once
    // it has settled is one that failed to load. Later reloads (CAS conflict,
    // resource_change) leave the state alone — the surface already has a
    // document to show.
    void load().finally(() => {
      if (disposed) return;
      setLoadState(
        store.getState().serverRevisions[scriptId] ? "ready" : "error"
      );
    });

    return () => {
      disposed = true;
      unwatch();
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (inFlightRef.current) flushAfterSaveRef.current = true;
      else void save(true);
    };
  }, [scriptId]);

  return loadState;
};

export default useScriptServerSync;
