/**
 * AnnotationStore
 *
 * Manages workflow annotations (sticky notes/comments) that can be placed
 * anywhere on the canvas to document complex workflows.
 *
 * Features:
 * - Create, edit, delete annotations
 * - Position annotations on the canvas
 * - Track annotation color for visual categorization
 * - Persist annotations with workflow data
 */

import { create } from "zustand";
import { XYPosition } from "@xyflow/react";

export interface Annotation {
  id: string;
  text: string;
  position: XYPosition;
  color: AnnotationColor;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
}

export type AnnotationColor =
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "orange";

export interface AnnotationColorInfo {
  id: AnnotationColor;
  label: string;
  bgColor: string;
  borderColor: string;
}

export const ANNOTATION_COLORS: AnnotationColorInfo[] = [
  { id: "yellow", label: "Yellow", bgColor: "#fff9c4", borderColor: "#fbc02d" },
  { id: "green", label: "Green", bgColor: "#dcedc8", borderColor: "#7cb342" },
  { id: "blue", label: "Blue", bgColor: "#bbdefb", borderColor: "#1976d2" },
  { id: "pink", label: "Pink", bgColor: "#f8bbd9", borderColor: "#c2185b" },
  { id: "orange", label: "Orange", bgColor: "#ffe0b2", borderColor: "#f57c00" }
];

export interface AnnotationStore {
  annotations: Record<string, Annotation>;
  selectedAnnotationId: string | null;

  addAnnotation: (
    position: XYPosition,
    text?: string,
    color?: AnnotationColor
  ) => string;

  updateAnnotation: (
    id: string,
    updates: Partial<Omit<Annotation, "id" | "createdAt">>
  ) => void;

  deleteAnnotation: (id: string) => void;

  selectAnnotation: (id: string | null) => void;

  getAnnotation: (id: string) => Annotation | undefined;

  getAllAnnotations: () => Annotation[];

  clearAnnotations: () => void;

  importAnnotations: (annotations: Annotation[]) => void;
}

const ANNOTATION_DEFAULTS: Pick<Annotation, "width" | "height" | "color"> = {
  width: 200,
  height: 150,
  color: "yellow"
};

const generateUUID = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const now = (): number => Date.now();

const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  annotations: {},

  selectedAnnotationId: null,

  addAnnotation: (position: XYPosition, text = "", color = "yellow") => {
    const id = generateUUID();
    const timestamp = now();

    const annotation: Annotation = {
      id,
      text,
      position,
      ...ANNOTATION_DEFAULTS,
      color,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    set((state) => ({
      annotations: {
        ...state.annotations,
        [id]: annotation
      }
    }));

    return id;
  },

  updateAnnotation: (
    id: string,
    updates: Partial<Omit<Annotation, "id" | "createdAt">>
  ) => {
    set((state) => {
      const existing = state.annotations[id];
      if (!existing) {
        return state;
      }

      return {
        annotations: {
          ...state.annotations,
          [id]: {
            ...existing,
            ...updates,
            updatedAt: now()
          }
        }
      };
    });
  },

  deleteAnnotation: (id: string) => {
    set((state) => {
      const { [id]: removed, ...rest } = state.annotations;
      return {
        annotations: rest,
        selectedAnnotationId:
          state.selectedAnnotationId === id ? null : state.selectedAnnotationId
      };
    });
  },

  selectAnnotation: (id: string | null) => {
    set({ selectedAnnotationId: id });
  },

  getAnnotation: (id: string) => {
    return get().annotations[id];
  },

  getAllAnnotations: () => {
    return Object.values(get().annotations);
  },

  clearAnnotations: () => {
    set({
      annotations: {},
      selectedAnnotationId: null
    });
  },

  importAnnotations: (annotations: Annotation[]) => {
    const annotationMap: Record<string, Annotation> = {};
    for (const annotation of annotations) {
      annotationMap[annotation.id] = annotation;
    }
    set({
      annotations: annotationMap,
      selectedAnnotationId: null
    });
  }
}));

export default useAnnotationStore;
