/**
 * FolderBatchStore manages the state for batch processing files from a folder.
 *
 * When the user selects a folder for batch processing, this store:
 * - Tracks the list of files to process
 * - Manages the current execution state (idle, running, paused, stopped)
 * - Tracks timing information (start time, elapsed time, estimated time remaining)
 * - Records the status of each file (pending, running, completed, failed)
 */

import { create } from "zustand";
import { TypeName } from "./ApiTypes";

export type BatchFileStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface BatchFile {
  /** The full path to the file */
  path: string;
  /** The file name (for display) */
  name: string;
  /** The detected content type (MIME type) */
  contentType: string;
  /** The matching input node type (e.g., "image", "audio", "video") */
  matchedType: TypeName | null;
  /** The ID of the input node this file will be used for */
  targetNodeId: string | null;
  /** Current processing status */
  status: BatchFileStatus;
  /** Error message if the file failed */
  error?: string;
  /** Processing time in milliseconds */
  processingTime?: number;
}

export type FolderBatchState = "idle" | "running" | "paused" | "completed" | "stopped";

interface FolderBatchStore {
  // State
  state: FolderBatchState;
  files: BatchFile[];
  currentIndex: number;
  folderPath: string | null;
  workflowId: string | null;
  
  // Timing
  startTime: number | null;
  pausedTime: number | null;
  totalPausedDuration: number;
  
  // Dialog visibility
  isDialogOpen: boolean;
  
  // Actions
  openDialog: () => void;
  closeDialog: () => void;
  
  /** Initialize batch processing with a list of files */
  initializeBatch: (
    folderPath: string,
    files: BatchFile[],
    workflowId: string
  ) => void;
  
  /** Start processing the batch */
  start: () => void;
  
  /** Pause processing */
  pause: () => void;
  
  /** Resume processing */
  resume: () => void;
  
  /** Stop processing completely */
  stop: () => void;
  
  /** Mark current file as started */
  markFileStarted: (index: number) => void;
  
  /** Mark a file as completed */
  markFileCompleted: (index: number, processingTime: number) => void;
  
  /** Mark a file as failed */
  markFileFailed: (index: number, error: string) => void;
  
  /** Mark a file as skipped (no matching input) */
  markFileSkipped: (index: number) => void;
  
  /** Move to the next file */
  nextFile: () => void;
  
  /** Reset the store to initial state */
  reset: () => void;
  
  // Computed getters (implemented as functions)
  getElapsedTime: () => number;
  getEstimatedTimeRemaining: () => number | null;
  getCompletedCount: () => number;
  getFailedCount: () => number;
  getSkippedCount: () => number;
  getProgress: () => number;
}

const initialState = {
  state: "idle" as FolderBatchState,
  files: [] as BatchFile[],
  currentIndex: -1,
  folderPath: null as string | null,
  workflowId: null as string | null,
  startTime: null as number | null,
  pausedTime: null as number | null,
  totalPausedDuration: 0,
  isDialogOpen: false,
};

export const useFolderBatchStore = create<FolderBatchStore>((set, get) => ({
  ...initialState,

  openDialog: () => set({ isDialogOpen: true }),
  closeDialog: () => set({ isDialogOpen: false }),

  initializeBatch: (folderPath, files, workflowId) => {
    set({
      folderPath,
      files,
      workflowId,
      currentIndex: -1,
      state: "idle",
      startTime: null,
      pausedTime: null,
      totalPausedDuration: 0,
    });
  },

  start: () => {
    const { files } = get();
    if (files.length === 0) {return;}
    
    set({
      state: "running",
      currentIndex: 0,
      startTime: Date.now(),
      pausedTime: null,
      totalPausedDuration: 0,
    });
  },

  pause: () => {
    const { state } = get();
    if (state !== "running") {return;}
    
    set({
      state: "paused",
      pausedTime: Date.now(),
    });
  },

  resume: () => {
    const { state, pausedTime, totalPausedDuration } = get();
    if (state !== "paused") {return;}
    
    const additionalPausedTime = pausedTime ? Date.now() - pausedTime : 0;
    
    set({
      state: "running",
      pausedTime: null,
      totalPausedDuration: totalPausedDuration + additionalPausedTime,
    });
  },

  stop: () => {
    set({
      state: "stopped",
      pausedTime: null,
    });
  },

  markFileStarted: (index) => {
    set((state) => {
      const files = [...state.files];
      if (index >= 0 && index < files.length) {
        files[index] = { ...files[index], status: "running" };
      }
      return { files };
    });
  },

  markFileCompleted: (index, processingTime) => {
    set((state) => {
      const files = [...state.files];
      if (index >= 0 && index < files.length) {
        files[index] = { ...files[index], status: "completed", processingTime };
      }
      return { files };
    });
  },

  markFileFailed: (index, error) => {
    set((state) => {
      const files = [...state.files];
      if (index >= 0 && index < files.length) {
        files[index] = { ...files[index], status: "failed", error };
      }
      return { files };
    });
  },

  markFileSkipped: (index) => {
    set((state) => {
      const files = [...state.files];
      if (index >= 0 && index < files.length) {
        files[index] = { ...files[index], status: "skipped" };
      }
      return { files };
    });
  },

  nextFile: () => {
    const { currentIndex, files, state } = get();
    if (state !== "running") {return;}
    
    const nextIndex = currentIndex + 1;
    if (nextIndex >= files.length) {
      set({ state: "completed", currentIndex: nextIndex });
    } else {
      set({ currentIndex: nextIndex });
    }
  },

  reset: () => {
    set(initialState);
  },

  getElapsedTime: () => {
    const { startTime, pausedTime, totalPausedDuration, state } = get();
    if (!startTime) {return 0;}
    
    const now = state === "paused" && pausedTime ? pausedTime : Date.now();
    return now - startTime - totalPausedDuration;
  },

  getEstimatedTimeRemaining: () => {
    const { files, currentIndex, state } = get();
    const elapsed = get().getElapsedTime();
    
    if (state === "idle" || currentIndex < 0) {return null;}
    
    const completedCount = files.filter(
      (f) => f.status === "completed" || f.status === "failed" || f.status === "skipped"
    ).length;
    
    if (completedCount === 0) {return null;}
    
    const averageTimePerFile = elapsed / completedCount;
    const remainingFiles = files.length - completedCount;
    
    return averageTimePerFile * remainingFiles;
  },

  getCompletedCount: () => {
    return get().files.filter((f) => f.status === "completed").length;
  },

  getFailedCount: () => {
    return get().files.filter((f) => f.status === "failed").length;
  },

  getSkippedCount: () => {
    return get().files.filter((f) => f.status === "skipped").length;
  },

  getProgress: () => {
    const { files } = get();
    if (files.length === 0) {return 0;}
    
    const processed = files.filter(
      (f) => f.status === "completed" || f.status === "failed" || f.status === "skipped"
    ).length;
    
    return (processed / files.length) * 100;
  },
}));

export default useFolderBatchStore;
