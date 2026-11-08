/**
 * CreateViewStore
 *
 * What the Create view's prompt bar holds that is not a generation setting: the
 * mode, the prompt, the attached references and how many takes one press
 * starts. The settings themselves (model, size, duration, presets) stay in
 * MediaGenerationStore, so the bar and the chat composer read the same model
 * and resolution rather than two copies that drift.
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

interface CreateViewState {
  mode: CreateMode;
  /** The sub-mode each kind was last on, so switching kinds and back keeps it. */
  kindModes: Record<CreateKind, CreateMode>;
  prompt: string;
  batch: number;
  references: CreateReference[];
  setMode: (mode: CreateMode) => void;
  setKind: (kind: CreateKind) => void;
  setPrompt: (prompt: string) => void;
  setBatch: (batch: number) => void;
  addReferences: (references: readonly CreateReference[]) => void;
  removeReference: (assetId: string) => void;
  clearReferences: () => void;
}

const isReference = (value: unknown): value is CreateReference =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as CreateReference).assetId === "string" &&
  typeof (value as CreateReference).contentType === "string" &&
  typeof (value as CreateReference).name === "string";

export const useCreateViewStore = create<CreateViewState>()(
  persist(
    (set) => ({
      mode: "image",
      kindModes: DEFAULT_KIND_MODES,
      prompt: "",
      batch: 1,
      references: [],
      setMode: (mode) =>
        set((state) => ({
          mode,
          kindModes: { ...state.kindModes, [createKindOf(mode)]: mode }
        })),
      setKind: (kind) => set((state) => ({ mode: state.kindModes[kind] })),
      setPrompt: (prompt) => set({ prompt }),
      setBatch: (batch) => set({ batch: clampCreateBatch(batch) }),
      addReferences: (references) =>
        set((state) => {
          const known = new Set(state.references.map((item) => item.assetId));
          const added = references.filter((item) => {
            const fresh = !known.has(item.assetId);
            known.add(item.assetId);
            return fresh;
          });
          return added.length > 0
            ? { references: [...state.references, ...added] }
            : state;
        }),
      removeReference: (assetId) =>
        set((state) => ({
          references: state.references.filter((item) => item.assetId !== assetId)
        })),
      clearReferences: () => set({ references: [] })
    }),
    {
      name: "nodetool-create-view",
      version: 1,
      partialize: ({ mode, kindModes, prompt, batch, references }) => ({
        mode,
        kindModes,
        prompt,
        batch,
        references
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<CreateViewState>;
        const savedKindModes = saved.kindModes ?? {};
        const kindModes = Object.fromEntries(
          CREATE_KINDS.map((kind) => {
            const mode = (savedKindModes as Partial<Record<CreateKind, string>>)[kind];
            return [
              kind,
              isCreateMode(mode) && createKindOf(mode) === kind
                ? mode
                : DEFAULT_KIND_MODES[kind]
            ];
          })
        ) as Record<CreateKind, CreateMode>;
        return {
          ...current,
          mode: isCreateMode(saved.mode) ? saved.mode : current.mode,
          kindModes,
          prompt: typeof saved.prompt === "string" ? saved.prompt : current.prompt,
          batch: clampCreateBatch(saved.batch ?? current.batch),
          references: Array.isArray(saved.references)
            ? saved.references.filter(isReference)
            : current.references
        };
      }
    }
  )
);

export default useCreateViewStore;
