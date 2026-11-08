/**
 * CreateViewStore
 *
 * What each Create tab's prompt bar holds that is not a generation setting:
 * the mode, the prompt, the attached references, how many takes one press
 * starts and which takes the grid shows. Every tab keeps its own draft, keyed
 * by its session id (the thread the tab records), so two open tabs do not
 * share a prompt. The settings themselves (model, size, duration, presets)
 * stay in MediaGenerationStore, so a model picked in one tab is the default
 * in the next, and the chat composer reads the same values.
 *
 * The mode lives here, not in MediaGenerationStore, because that store's mode
 * belongs to the chat composer: changing it from the Create view would switch
 * the mode of every chat that has not chosen its own.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MediaGenerationCategory, MediaMode } from "./MediaGenerationStore";

/** Every mode the Create view submits, in the order its rows list them. */
export const CREATE_MODES = [
  "image",
  "image_edit",
  "video",
  "image_to_video",
  "reference_to_video",
  "retake",
  "extend",
  "audio",
  "music"
] as const satisfies readonly MediaMode[];

export type CreateMode = (typeof CREATE_MODES)[number];

/** The media a mode produces: the Create view's top row. */
export type CreateKind = MediaGenerationCategory;

export const CREATE_KINDS = ["image", "video", "audio"] as const satisfies readonly CreateKind[];

/** The sub-modes under each kind, first one the default. */
export const CREATE_KIND_MODES: Record<CreateKind, readonly CreateMode[]> = {
  image: ["image", "image_edit"],
  video: ["video", "image_to_video", "reference_to_video", "retake", "extend"],
  audio: ["audio", "music"]
};

export const isCreateMode = (mode: string | null | undefined): mode is CreateMode =>
  CREATE_MODES.some((candidate) => candidate === mode);

export const createKindOf = (mode: CreateMode): CreateKind =>
  CREATE_KINDS.find((kind) => CREATE_KIND_MODES[kind].includes(mode)) ?? "image";

/** A library asset attached to the prompt: a source, a start frame or a reference. */
export interface CreateReference {
  assetId: string;
  contentType: string;
  name: string;
}

/** The media family of a reference, read from its content type. */
export const referenceKind = (
  reference: Pick<CreateReference, "contentType">
): "image" | "video" | "audio" | "other" => {
  const type = reference.contentType;
  if (type.startsWith("image/")) {
    return "image";
  }
  if (type.startsWith("video/")) {
    return "video";
  }
  if (type.startsWith("audio/")) {
    return "audio";
  }
  return "other";
};

/** Takes one press can start, each its own `generate_media` request. */
export const CREATE_BATCH_OPTIONS = [1, 2, 3, 4] as const;

export const MAX_CREATE_BATCH = CREATE_BATCH_OPTIONS[CREATE_BATCH_OPTIONS.length - 1];

export const clampCreateBatch = (value: number): number =>
  Math.min(MAX_CREATE_BATCH, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)));

const DEFAULT_KIND_MODES: Record<CreateKind, CreateMode> = {
  image: "image",
  video: "video",
  audio: "audio"
};

/**
 * The session id of the Create view opened before tabs had sessions. It
 * records no thread, so it always shows every take.
 */
export const GLOBAL_CREATE_SESSION = "create";

/** Which takes a Create tab's grid lists. */
export type CreateScope = "session" | "all";

export interface CreateDraft {
  mode: CreateMode;
  /** The sub-mode each kind was last on, so switching kinds and back keeps it. */
  kindModes: Record<CreateKind, CreateMode>;
  prompt: string;
  batch: number;
  references: CreateReference[];
  scope: CreateScope;
  /** Whether the tab is already named after its first prompt. */
  titled: boolean;
}

/** What a tab holds before anything is typed. Shared, so selectors stay stable. */
export const EMPTY_CREATE_DRAFT: CreateDraft = Object.freeze({
  mode: "image",
  kindModes: DEFAULT_KIND_MODES,
  prompt: "",
  batch: 1,
  references: [],
  scope: "session",
  titled: false
}) as CreateDraft;

/** Drafts kept across reloads. The oldest go first. */
export const MAX_CREATE_DRAFTS = 40;

/** What a new tab starts with: the mode it was opened in and any carried prompt. */
export interface CreateSessionSeed {
  mode?: CreateMode;
  prompt?: string;
  references?: readonly CreateReference[];
}

interface CreateViewState {
  drafts: Record<string, CreateDraft>;
  startSession: (sessionId: string, seed?: CreateSessionSeed) => void;
  dropSession: (sessionId: string) => void;
  setMode: (sessionId: string, mode: CreateMode) => void;
  setKind: (sessionId: string, kind: CreateKind) => void;
  setPrompt: (sessionId: string, prompt: string) => void;
  setBatch: (sessionId: string, batch: number) => void;
  setScope: (sessionId: string, scope: CreateScope) => void;
  markTitled: (sessionId: string) => void;
  addReferences: (sessionId: string, references: readonly CreateReference[]) => void;
  removeReference: (sessionId: string, assetId: string) => void;
  clearReferences: (sessionId: string) => void;
}

/** A session's draft, or the empty one. */
export const createDraftOf = (
  state: Pick<CreateViewState, "drafts">,
  sessionId: string
): CreateDraft => state.drafts[sessionId] ?? EMPTY_CREATE_DRAFT;

/** Keep the newest drafts, by the order they were last written. */
const capDrafts = (drafts: Record<string, CreateDraft>): Record<string, CreateDraft> => {
  const ids = Object.keys(drafts);
  if (ids.length <= MAX_CREATE_DRAFTS) {
    return drafts;
  }
  return Object.fromEntries(
    ids.slice(ids.length - MAX_CREATE_DRAFTS).map((id) => [id, drafts[id]])
  );
};

const isReference = (value: unknown): value is CreateReference =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as CreateReference).assetId === "string" &&
  typeof (value as CreateReference).contentType === "string" &&
  typeof (value as CreateReference).name === "string";

const dedupe = (
  current: readonly CreateReference[],
  added: readonly CreateReference[]
): CreateReference[] => {
  const known = new Set(current.map((item) => item.assetId));
  const fresh = added.filter((item) => {
    const isNew = !known.has(item.assetId);
    known.add(item.assetId);
    return isNew;
  });
  return fresh.length > 0 ? [...current, ...fresh] : [...current];
};

/** A saved draft with every field checked, or null when it is not one. */
const readDraft = (value: unknown): CreateDraft | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const saved = value as Partial<CreateDraft>;
  const savedKindModes = (saved.kindModes ?? {}) as Partial<Record<CreateKind, string>>;
  const kindModes = Object.fromEntries(
    CREATE_KINDS.map((kind) => {
      const mode = savedKindModes[kind];
      return [
        kind,
        isCreateMode(mode) && createKindOf(mode) === kind ? mode : DEFAULT_KIND_MODES[kind]
      ];
    })
  ) as Record<CreateKind, CreateMode>;
  return {
    mode: isCreateMode(saved.mode) ? saved.mode : EMPTY_CREATE_DRAFT.mode,
    kindModes,
    prompt: typeof saved.prompt === "string" ? saved.prompt : "",
    batch: clampCreateBatch(saved.batch ?? 1),
    references: Array.isArray(saved.references) ? saved.references.filter(isReference) : [],
    scope: saved.scope === "all" ? "all" : "session",
    titled: saved.titled === true
  };
};

export const useCreateViewStore = create<CreateViewState>()(
  persist(
    (set) => {
      /** Write one session's draft, moving it to the newest end. */
      const update = (sessionId: string, patch: (draft: CreateDraft) => Partial<CreateDraft>) =>
        set((state) => {
          const draft = createDraftOf(state, sessionId);
          const { [sessionId]: _previous, ...rest } = state.drafts;
          return { drafts: capDrafts({ ...rest, [sessionId]: { ...draft, ...patch(draft) } }) };
        });
      return {
        drafts: {},
        startSession: (sessionId, seed = {}) =>
          update(sessionId, (draft) => {
            const mode = seed.mode ?? draft.mode;
            return {
              mode,
              kindModes: { ...draft.kindModes, [createKindOf(mode)]: mode },
              ...(seed.prompt !== undefined && { prompt: seed.prompt }),
              ...(seed.references && { references: dedupe([], seed.references) })
            };
          }),
        dropSession: (sessionId) =>
          set((state) => {
            const { [sessionId]: _dropped, ...rest } = state.drafts;
            return { drafts: rest };
          }),
        setMode: (sessionId, mode) =>
          update(sessionId, (draft) => ({
            mode,
            kindModes: { ...draft.kindModes, [createKindOf(mode)]: mode }
          })),
        setKind: (sessionId, kind) => update(sessionId, (draft) => ({ mode: draft.kindModes[kind] })),
        setPrompt: (sessionId, prompt) => update(sessionId, () => ({ prompt })),
        setBatch: (sessionId, batch) => update(sessionId, () => ({ batch: clampCreateBatch(batch) })),
        setScope: (sessionId, scope) => update(sessionId, () => ({ scope })),
        markTitled: (sessionId) => update(sessionId, () => ({ titled: true })),
        addReferences: (sessionId, references) =>
          update(sessionId, (draft) => ({ references: dedupe(draft.references, references) })),
        removeReference: (sessionId, assetId) =>
          update(sessionId, (draft) => ({
            references: draft.references.filter((item) => item.assetId !== assetId)
          })),
        clearReferences: (sessionId) => update(sessionId, () => ({ references: [] }))
      };
    },
    {
      name: "nodetool-create-view",
      version: 2,
      partialize: ({ drafts }) => ({ drafts }),
      // Version 1 held one draft for the single Create view; it becomes that
      // view's draft.
      migrate: (persisted, version) =>
        version < 2 ? { drafts: { [GLOBAL_CREATE_SESSION]: persisted } } : persisted,
      merge: (persisted, current) => {
        const saved = ((persisted ?? {}) as { drafts?: Record<string, unknown> }).drafts ?? {};
        const drafts: Record<string, CreateDraft> = {};
        for (const [id, value] of Object.entries(saved)) {
          const draft = readDraft(value);
          if (draft) {
            drafts[id] = draft;
          }
        }
        return { ...current, drafts: capDrafts(drafts) };
      }
    }
  )
);

export default useCreateViewStore;
