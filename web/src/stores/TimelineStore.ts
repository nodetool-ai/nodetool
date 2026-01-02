/**
 * TimelineStore manages state for the multi-track timeline editor.
 *
 * Responsibilities:
 * - Track management (add, remove, reorder tracks)
 * - Clip operations (add, move, trim, split, delete)
 * - Playback control (play, pause, seek)
 * - Selection state
 * - Zoom and scroll position
 */

import { create } from "zustand";
import { temporal } from "zundo";
import type { TemporalState } from "zundo";
import { useStoreWithEqualityFn } from "zustand/traditional";
import isEqual from "lodash/isEqual";
import { generateTimelineId, clamp, snapToFrame, rangesOverlap } from "../utils/timelineUtils";
import type { AudioRef, VideoRef, ImageRef } from "./ApiTypes";

// ============================================================================
// Types
// ============================================================================

export type ClipType = "audio" | "video" | "image";

export interface Transition {
  type: "crossfade" | "dissolve" | "cut";
  duration: number;
}

export interface Clip {
  id: string;
  type: ClipType;
  sourceRef: AudioRef | VideoRef | ImageRef | null;
  sourceUrl: string;
  name: string;
  startTime: number;      // Position on timeline (seconds)
  duration: number;       // Duration on timeline (seconds)
  inPoint: number;        // Trim start within source (seconds)
  outPoint: number;       // Trim end within source (seconds)
  sourceDuration: number; // Original source duration (seconds)
  speed: number;          // Playback rate (1.0 = normal)
  volume?: number;        // Audio volume (0-1)
  opacity?: number;       // Video/image opacity (0-1)
  fadeIn?: number;        // Fade in duration (seconds)
  fadeOut?: number;       // Fade out duration (seconds)
  transitions?: {
    in?: Transition;
    out?: Transition;
  };
  color?: string;         // Clip color for visual distinction
  locked?: boolean;       // Prevent editing
}

export type TrackType = "audio" | "video" | "image";

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  visible: boolean;
  height: number;         // Track height in pixels
  clips: Clip[];
  volume?: number;        // Track-level volume (for audio)
  color?: string;         // Track color
}

export interface TimelineProject {
  id: string;
  name: string;
  duration: number;       // Total duration (seconds)
  frameRate: number;      // Frames per second (24, 30, 60)
  sampleRate: number;     // Audio sample rate
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  playheadPosition: number;  // Current time (seconds)
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
}

export interface ViewportState {
  scrollLeft: number;        // Horizontal scroll position (pixels)
  pixelsPerSecond: number;   // Zoom level
  viewportWidth: number;     // Visible width (pixels)
}

export interface SelectionState {
  selectedClipIds: string[];
  selectedTrackId: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
}

// ============================================================================
// Store Interface
// ============================================================================

export interface TimelineStoreState {
  // Project state
  project: TimelineProject | null;
  
  // Playback state
  playback: PlaybackState;
  
  // Viewport state
  viewport: ViewportState;
  
  // Selection state
  selection: SelectionState;
  
  // Snap settings
  snapEnabled: boolean;
  snapToFrames: boolean;
  snapToClips: boolean;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  
  // Project operations
  createProject: (name: string, frameRate?: number) => void;
  loadProject: (project: TimelineProject) => void;
  updateProjectDuration: () => void;
  
  // Track operations
  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  reorderTrack: (trackId: string, newIndex: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;
  
  // Clip operations
  addClip: (
    trackId: string,
    clipData: Omit<Clip, "id">
  ) => string | null;
  removeClip: (trackId: string, clipId: string) => void;
  updateClip: (trackId: string, clipId: string, updates: Partial<Clip>) => void;
  moveClip: (
    sourceTrackId: string,
    clipId: string,
    targetTrackId: string,
    newStartTime: number
  ) => void;
  trimClipStart: (trackId: string, clipId: string, newStartTime: number) => void;
  trimClipEnd: (trackId: string, clipId: string, newEndTime: number) => void;
  splitClip: (trackId: string, clipId: string, splitTime: number) => string | null;
  duplicateClip: (trackId: string, clipId: string) => string | null;
  
  // Playback operations
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlayback: () => void;
  seek: (time: number) => void;
  seekRelative: (delta: number) => void;
  stepFrame: (direction: 1 | -1) => void;
  setLoopRegion: (start: number, end: number) => void;
  toggleLoop: () => void;
  clearLoopRegion: () => void;
  
  // Viewport operations
  setZoom: (pixelsPerSecond: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  setScrollLeft: (scrollLeft: number) => void;
  setViewportWidth: (width: number) => void;
  scrollToTime: (time: number) => void;
  
  // Selection operations
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  deselectClip: (clipId: string) => void;
  clearClipSelection: () => void;
  selectTrack: (trackId: string | null) => void;
  setTimeSelection: (start: number | null, end: number | null) => void;
  selectAllClipsInRange: (start: number, end: number) => void;
  
  // Snap operations
  toggleSnap: () => void;
  setSnapToFrames: (enabled: boolean) => void;
  setSnapToClips: (enabled: boolean) => void;
  getSnappedTime: (time: number, excludeClipId?: string) => number;
  
  // Utility
  getTrackById: (trackId: string) => Track | undefined;
  getClipById: (clipId: string) => { track: Track; clip: Clip } | undefined;
  getClipsAtTime: (time: number) => Array<{ track: Track; clip: Clip }>;
  
  // Reset
  reset: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_FRAME_RATE = 30;
const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_TRACK_HEIGHT = 60;
const MIN_ZOOM = 10;    // 10 pixels per second
const MAX_ZOOM = 500;   // 500 pixels per second
const DEFAULT_ZOOM = 50;

const INITIAL_PLAYBACK: PlaybackState = {
  isPlaying: false,
  playheadPosition: 0,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0
};

const INITIAL_VIEWPORT: ViewportState = {
  scrollLeft: 0,
  pixelsPerSecond: DEFAULT_ZOOM,
  viewportWidth: 800
};

const INITIAL_SELECTION: SelectionState = {
  selectedClipIds: [],
  selectedTrackId: null,
  selectionStart: null,
  selectionEnd: null
};

// ============================================================================
// Helper Functions
// ============================================================================

const createDefaultProject = (name: string, frameRate: number): TimelineProject => ({
  id: generateTimelineId(),
  name,
  duration: 60, // Default 1 minute
  frameRate,
  sampleRate: DEFAULT_SAMPLE_RATE,
  tracks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const getTrackColor = (type: TrackType): string => {
  switch (type) {
    case "video":
      return "#4a90d9";
    case "audio":
      return "#5cb85c";
    case "image":
      return "#d97b4a";
    default:
      return "#888888";
  }
};

const getClipColor = (type: ClipType): string => {
  switch (type) {
    case "video":
      return "#3a7bc8";
    case "audio":
      return "#4ca84c";
    case "image":
      return "#c96b3a";
    default:
      return "#666666";
  }
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useTimelineStore = create<TimelineStoreState>()(
  temporal(
    (set, get) => ({
      // Initial state
      project: null,
      playback: INITIAL_PLAYBACK,
      viewport: INITIAL_VIEWPORT,
      selection: INITIAL_SELECTION,
      snapEnabled: true,
      snapToFrames: true,
      snapToClips: true,
      isLoading: false,
      error: null,

      // Project operations
      createProject: (name: string, frameRate = DEFAULT_FRAME_RATE) => {
        const project = createDefaultProject(name, frameRate);
        set({ 
          project,
          playback: INITIAL_PLAYBACK,
          selection: INITIAL_SELECTION,
          error: null
        });
      },

      loadProject: (project: TimelineProject) => {
        set({ 
          project: { ...project },
          playback: INITIAL_PLAYBACK,
          selection: INITIAL_SELECTION,
          error: null
        });
      },

      updateProjectDuration: () => {
        const { project } = get();
        if (!project) {
          return;
        }

        let maxEndTime = 0;
        for (const track of project.tracks) {
          for (const clip of track.clips) {
            const clipEnd = clip.startTime + clip.duration;
            if (clipEnd > maxEndTime) {
              maxEndTime = clipEnd;
            }
          }
        }

        // Add some padding
        const newDuration = Math.max(60, maxEndTime + 10);
        if (newDuration !== project.duration) {
          set({
            project: {
              ...project,
              duration: newDuration,
              updatedAt: new Date().toISOString()
            }
          });
        }
      },

      // Track operations
      addTrack: (type: TrackType, name?: string) => {
        const { project } = get();
        if (!project) {
          return "";
        }

        const trackCount = project.tracks.filter(t => t.type === type).length;
        const trackName = name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${trackCount + 1}`;
        
        const newTrack: Track = {
          id: generateTimelineId(),
          name: trackName,
          type,
          muted: false,
          solo: false,
          locked: false,
          visible: true,
          height: DEFAULT_TRACK_HEIGHT,
          clips: [],
          volume: type === "audio" ? 1 : undefined,
          color: getTrackColor(type)
        };

        set({
          project: {
            ...project,
            tracks: [...project.tracks, newTrack],
            updatedAt: new Date().toISOString()
          }
        });

        return newTrack.id;
      },

      removeTrack: (trackId: string) => {
        const { project, selection } = get();
        if (!project) {
          return;
        }

        const trackIndex = project.tracks.findIndex(t => t.id === trackId);
        if (trackIndex === -1) {
          return;
        }

        const track = project.tracks[trackIndex];
        const clipIdsToRemove = track.clips.map(c => c.id);

        set({
          project: {
            ...project,
            tracks: project.tracks.filter(t => t.id !== trackId),
            updatedAt: new Date().toISOString()
          },
          selection: {
            ...selection,
            selectedClipIds: selection.selectedClipIds.filter(
              id => !clipIdsToRemove.includes(id)
            ),
            selectedTrackId: selection.selectedTrackId === trackId 
              ? null 
              : selection.selectedTrackId
          }
        });
      },

      updateTrack: (trackId: string, updates: Partial<Track>) => {
        const { project } = get();
        if (!project) {
          return;
        }

        set({
          project: {
            ...project,
            tracks: project.tracks.map(track =>
              track.id === trackId ? { ...track, ...updates } : track
            ),
            updatedAt: new Date().toISOString()
          }
        });
      },

      reorderTrack: (trackId: string, newIndex: number) => {
        const { project } = get();
        if (!project) {
          return;
        }

        const currentIndex = project.tracks.findIndex(t => t.id === trackId);
        if (currentIndex === -1) {
          return;
        }

        const tracks = [...project.tracks];
        const [track] = tracks.splice(currentIndex, 1);
        const clampedIndex = clamp(newIndex, 0, tracks.length);
        tracks.splice(clampedIndex, 0, track);

        set({
          project: {
            ...project,
            tracks,
            updatedAt: new Date().toISOString()
          }
        });
      },

      toggleTrackMute: (trackId: string) => {
        const { updateTrack, getTrackById } = get();
        const track = getTrackById(trackId);
        if (track) {
          updateTrack(trackId, { muted: !track.muted });
        }
      },

      toggleTrackSolo: (trackId: string) => {
        const { updateTrack, getTrackById } = get();
        const track = getTrackById(trackId);
        if (track) {
          updateTrack(trackId, { solo: !track.solo });
        }
      },

      toggleTrackLock: (trackId: string) => {
        const { updateTrack, getTrackById } = get();
        const track = getTrackById(trackId);
        if (track) {
          updateTrack(trackId, { locked: !track.locked });
        }
      },

      toggleTrackVisibility: (trackId: string) => {
        const { updateTrack, getTrackById } = get();
        const track = getTrackById(trackId);
        if (track) {
          updateTrack(trackId, { visible: !track.visible });
        }
      },

      // Clip operations
      addClip: (trackId: string, clipData: Omit<Clip, "id">) => {
        const { project, getTrackById, getSnappedTime, updateProjectDuration } = get();
        if (!project) {
          return null;
        }

        const track = getTrackById(trackId);
        if (!track || track.locked) {
          return null;
        }

        // Check for overlapping clips
        const snappedStart = getSnappedTime(clipData.startTime);
        const clipEnd = snappedStart + clipData.duration;
        
        const hasOverlap = track.clips.some(existingClip => 
          rangesOverlap(
            snappedStart,
            clipEnd,
            existingClip.startTime,
            existingClip.startTime + existingClip.duration
          )
        );

        if (hasOverlap) {
          return null; // Don't allow overlapping clips
        }

        const newClip: Clip = {
          ...clipData,
          id: generateTimelineId(),
          startTime: snappedStart,
          color: clipData.color || getClipColor(clipData.type)
        };

        set({
          project: {
            ...project,
            tracks: project.tracks.map(t =>
              t.id === trackId
                ? { ...t, clips: [...t.clips, newClip].sort((a, b) => a.startTime - b.startTime) }
                : t
            ),
            updatedAt: new Date().toISOString()
          }
        });

        updateProjectDuration();
        return newClip.id;
      },

      removeClip: (trackId: string, clipId: string) => {
        const { project, selection, getTrackById } = get();
        if (!project) {
          return;
        }

        const track = getTrackById(trackId);
        if (!track || track.locked) {
          return;
        }

        set({
          project: {
            ...project,
            tracks: project.tracks.map(t =>
              t.id === trackId
                ? { ...t, clips: t.clips.filter(c => c.id !== clipId) }
                : t
            ),
            updatedAt: new Date().toISOString()
          },
          selection: {
            ...selection,
            selectedClipIds: selection.selectedClipIds.filter(id => id !== clipId)
          }
        });
      },

      updateClip: (trackId: string, clipId: string, updates: Partial<Clip>) => {
        const { project, getTrackById, updateProjectDuration } = get();
        if (!project) {
          return;
        }

        const track = getTrackById(trackId);
        if (!track || track.locked) {
          return;
        }

        set({
          project: {
            ...project,
            tracks: project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    clips: t.clips
                      .map(c => c.id === clipId ? { ...c, ...updates } : c)
                      .sort((a, b) => a.startTime - b.startTime)
                  }
                : t
            ),
            updatedAt: new Date().toISOString()
          }
        });

        updateProjectDuration();
      },

      moveClip: (
        sourceTrackId: string,
        clipId: string,
        targetTrackId: string,
        newStartTime: number
      ) => {
        const { project, getTrackById, getSnappedTime, updateProjectDuration } = get();
        if (!project) {
          return;
        }

        const sourceTrack = getTrackById(sourceTrackId);
        const targetTrack = getTrackById(targetTrackId);
        
        if (!sourceTrack || !targetTrack || sourceTrack.locked || targetTrack.locked) {
          return;
        }

        const clip = sourceTrack.clips.find(c => c.id === clipId);
        if (!clip || clip.locked) {
          return;
        }

        // Check if clip types are compatible
        if (clip.type !== targetTrack.type) {
          return;
        }

        const snappedStart = getSnappedTime(Math.max(0, newStartTime), clipId);
        const clipEnd = snappedStart + clip.duration;

        // Check for overlaps in target track (excluding the clip being moved)
        const hasOverlap = targetTrack.clips
          .filter(c => c.id !== clipId)
          .some(existingClip =>
            rangesOverlap(
              snappedStart,
              clipEnd,
              existingClip.startTime,
              existingClip.startTime + existingClip.duration
            )
          );

        if (hasOverlap) {
          return;
        }

        const updatedClip = { ...clip, startTime: snappedStart };

        set({
          project: {
            ...project,
            tracks: project.tracks.map(t => {
              if (t.id === sourceTrackId && sourceTrackId === targetTrackId) {
                // Moving within same track
                return {
                  ...t,
                  clips: t.clips
                    .map(c => c.id === clipId ? updatedClip : c)
                    .sort((a, b) => a.startTime - b.startTime)
                };
              } else if (t.id === sourceTrackId) {
                // Remove from source
                return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
              } else if (t.id === targetTrackId) {
                // Add to target
                return {
                  ...t,
                  clips: [...t.clips, updatedClip].sort((a, b) => a.startTime - b.startTime)
                };
              }
              return t;
            }),
            updatedAt: new Date().toISOString()
          }
        });

        updateProjectDuration();
      },

      trimClipStart: (trackId: string, clipId: string, newStartTime: number) => {
        const { project, getTrackById, getSnappedTime, updateProjectDuration } = get();
        if (!project) {
          return;
        }

        const track = getTrackById(trackId);
        if (!track || track.locked) {
          return;
        }

        const clip = track.clips.find(c => c.id === clipId);
        if (!clip || clip.locked) {
          return;
        }

        const snappedStart = getSnappedTime(Math.max(0, newStartTime), clipId);
        const clipEnd = clip.startTime + clip.duration;
        
        // Don't allow trimming past the end of the clip
        if (snappedStart >= clipEnd) {
          return;
        }

        const timeDelta = snappedStart - clip.startTime;
        const newInPoint = clip.inPoint + timeDelta;
        const newDuration = clipEnd - snappedStart;

        // Don't allow inPoint to be negative or past outPoint
        if (newInPoint < 0 || newInPoint >= clip.outPoint) {
          return;
        }

        set({
          project: {
            ...project,
            tracks: project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    clips: t.clips
                      .map(c => c.id === clipId 
                        ? { ...c, startTime: snappedStart, inPoint: newInPoint, duration: newDuration }
                        : c
                      )
                      .sort((a, b) => a.startTime - b.startTime)
                  }
                : t
            ),
            updatedAt: new Date().toISOString()
          }
        });

        updateProjectDuration();
      },

      trimClipEnd: (trackId: string, clipId: string, newEndTime: number) => {
        const { project, getTrackById, getSnappedTime, updateProjectDuration } = get();
        if (!project) {
          return;
        }

        const track = getTrackById(trackId);
        if (!track || track.locked) {
          return;
        }

        const clip = track.clips.find(c => c.id === clipId);
        if (!clip || clip.locked) {
          return;
        }

        const snappedEnd = getSnappedTime(newEndTime, clipId);
        
        // Don't allow trimming past the start of the clip
        if (snappedEnd <= clip.startTime) {
          return;
        }

        const newDuration = snappedEnd - clip.startTime;
        const newOutPoint = clip.inPoint + newDuration;

        // For video/audio: don't allow outPoint to exceed source duration
        // For images: allow any duration (images can be shown indefinitely)
        if (clip.type !== "image") {
          if (newOutPoint > clip.sourceDuration || newOutPoint <= clip.inPoint) {
            return;
          }
        }

        set({
          project: {
            ...project,
            tracks: project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    clips: t.clips.map(c => c.id === clipId 
                      ? { ...c, duration: newDuration, outPoint: newOutPoint }
                      : c
                    )
                  }
                : t
            ),
            updatedAt: new Date().toISOString()
          }
        });

        updateProjectDuration();
      },

      splitClip: (trackId: string, clipId: string, splitTime: number) => {
        const { project, getTrackById, getSnappedTime, updateProjectDuration } = get();
        if (!project) {
          return null;
        }

        const track = getTrackById(trackId);
        if (!track || track.locked) {
          return null;
        }

        const clip = track.clips.find(c => c.id === clipId);
        if (!clip || clip.locked) {
          return null;
        }

        const snappedSplit = getSnappedTime(splitTime);
        const clipEnd = clip.startTime + clip.duration;

        // Split time must be within the clip
        if (snappedSplit <= clip.startTime || snappedSplit >= clipEnd) {
          return null;
        }

        const splitInSource = clip.inPoint + (snappedSplit - clip.startTime);

        // Create two clips from the split
        const firstClip: Clip = {
          ...clip,
          duration: snappedSplit - clip.startTime,
          outPoint: splitInSource,
          fadeOut: undefined,
          transitions: clip.transitions ? { in: clip.transitions.in } : undefined
        };

        const secondClip: Clip = {
          ...clip,
          id: generateTimelineId(),
          startTime: snappedSplit,
          duration: clipEnd - snappedSplit,
          inPoint: splitInSource,
          fadeIn: undefined,
          transitions: clip.transitions ? { out: clip.transitions.out } : undefined
        };

        set({
          project: {
            ...project,
            tracks: project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    clips: [...t.clips.filter(c => c.id !== clipId), firstClip, secondClip]
                      .sort((a, b) => a.startTime - b.startTime)
                  }
                : t
            ),
            updatedAt: new Date().toISOString()
          }
        });

        updateProjectDuration();
        return secondClip.id;
      },

      duplicateClip: (trackId: string, clipId: string) => {
        const { project, getTrackById, updateProjectDuration } = get();
        if (!project) {
          return null;
        }

        const track = getTrackById(trackId);
        if (!track || track.locked) {
          return null;
        }

        const clip = track.clips.find(c => c.id === clipId);
        if (!clip) {
          return null;
        }

        // Find the next available position after the clip
        const clipEnd = clip.startTime + clip.duration;
        const newClip: Clip = {
          ...clip,
          id: generateTimelineId(),
          startTime: clipEnd,
          locked: false
        };

        // Check for overlap
        const hasOverlap = track.clips.some(existingClip =>
          rangesOverlap(
            newClip.startTime,
            newClip.startTime + newClip.duration,
            existingClip.startTime,
            existingClip.startTime + existingClip.duration
          )
        );

        if (hasOverlap) {
          return null;
        }

        set({
          project: {
            ...project,
            tracks: project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    clips: [...t.clips, newClip].sort((a, b) => a.startTime - b.startTime)
                  }
                : t
            ),
            updatedAt: new Date().toISOString()
          }
        });

        updateProjectDuration();
        return newClip.id;
      },

      // Playback operations
      play: () => {
        set(state => ({
          playback: { ...state.playback, isPlaying: true }
        }));
      },

      pause: () => {
        set(state => ({
          playback: { ...state.playback, isPlaying: false }
        }));
      },

      stop: () => {
        set(state => ({
          playback: { 
            ...state.playback, 
            isPlaying: false,
            playheadPosition: state.playback.loopEnabled ? state.playback.loopStart : 0
          }
        }));
      },

      togglePlayback: () => {
        const { playback } = get();
        set({
          playback: { ...playback, isPlaying: !playback.isPlaying }
        });
      },

      seek: (time: number) => {
        const { project, playback } = get();
        const maxTime = project?.duration || 0;
        const clampedTime = clamp(time, 0, maxTime);
        
        set({
          playback: { ...playback, playheadPosition: clampedTime }
        });
      },

      seekRelative: (delta: number) => {
        const { playback, seek } = get();
        seek(playback.playheadPosition + delta);
      },

      stepFrame: (direction: 1 | -1) => {
        const { project, playback, seek } = get();
        if (!project) {
          return;
        }
        const frameDuration = 1 / project.frameRate;
        seek(playback.playheadPosition + (frameDuration * direction));
      },

      setLoopRegion: (start: number, end: number) => {
        const { project, playback } = get();
        const maxTime = project?.duration || 0;
        
        set({
          playback: {
            ...playback,
            loopStart: clamp(Math.min(start, end), 0, maxTime),
            loopEnd: clamp(Math.max(start, end), 0, maxTime),
            loopEnabled: true
          }
        });
      },

      toggleLoop: () => {
        set(state => ({
          playback: { ...state.playback, loopEnabled: !state.playback.loopEnabled }
        }));
      },

      clearLoopRegion: () => {
        set(state => ({
          playback: { 
            ...state.playback, 
            loopEnabled: false,
            loopStart: 0,
            loopEnd: 0
          }
        }));
      },

      // Viewport operations
      setZoom: (pixelsPerSecond: number) => {
        const { viewport } = get();
        set({
          viewport: {
            ...viewport,
            pixelsPerSecond: clamp(pixelsPerSecond, MIN_ZOOM, MAX_ZOOM)
          }
        });
      },

      zoomIn: () => {
        const { viewport, setZoom } = get();
        setZoom(viewport.pixelsPerSecond * 1.25);
      },

      zoomOut: () => {
        const { viewport, setZoom } = get();
        setZoom(viewport.pixelsPerSecond / 1.25);
      },

      zoomToFit: () => {
        const { project, viewport } = get();
        if (!project || viewport.viewportWidth === 0) {
          return;
        }

        const targetZoom = (viewport.viewportWidth - 40) / project.duration;
        set({
          viewport: {
            ...viewport,
            pixelsPerSecond: clamp(targetZoom, MIN_ZOOM, MAX_ZOOM),
            scrollLeft: 0
          }
        });
      },

      setScrollLeft: (scrollLeft: number) => {
        set(state => ({
          viewport: { ...state.viewport, scrollLeft: Math.max(0, scrollLeft) }
        }));
      },

      setViewportWidth: (width: number) => {
        set(state => ({
          viewport: { ...state.viewport, viewportWidth: width }
        }));
      },

      scrollToTime: (time: number) => {
        const { viewport } = get();
        const targetScroll = time * viewport.pixelsPerSecond - viewport.viewportWidth / 2;
        set({
          viewport: { ...viewport, scrollLeft: Math.max(0, targetScroll) }
        });
      },

      // Selection operations
      selectClip: (clipId: string, addToSelection = false) => {
        const { selection } = get();
        
        if (addToSelection) {
          const isAlreadySelected = selection.selectedClipIds.includes(clipId);
          set({
            selection: {
              ...selection,
              selectedClipIds: isAlreadySelected
                ? selection.selectedClipIds.filter(id => id !== clipId)
                : [...selection.selectedClipIds, clipId]
            }
          });
        } else {
          set({
            selection: {
              ...selection,
              selectedClipIds: [clipId]
            }
          });
        }
      },

      selectClips: (clipIds: string[]) => {
        set(state => ({
          selection: { ...state.selection, selectedClipIds: clipIds }
        }));
      },

      deselectClip: (clipId: string) => {
        set(state => ({
          selection: {
            ...state.selection,
            selectedClipIds: state.selection.selectedClipIds.filter(id => id !== clipId)
          }
        }));
      },

      clearClipSelection: () => {
        set(state => ({
          selection: { ...state.selection, selectedClipIds: [] }
        }));
      },

      selectTrack: (trackId: string | null) => {
        set(state => ({
          selection: { ...state.selection, selectedTrackId: trackId }
        }));
      },

      setTimeSelection: (start: number | null, end: number | null) => {
        set(state => ({
          selection: {
            ...state.selection,
            selectionStart: start,
            selectionEnd: end
          }
        }));
      },

      selectAllClipsInRange: (start: number, end: number) => {
        const { project } = get();
        if (!project) {
          return;
        }

        const clipIds: string[] = [];
        for (const track of project.tracks) {
          for (const clip of track.clips) {
            const clipEnd = clip.startTime + clip.duration;
            if (rangesOverlap(start, end, clip.startTime, clipEnd)) {
              clipIds.push(clip.id);
            }
          }
        }

        set(state => ({
          selection: { ...state.selection, selectedClipIds: clipIds }
        }));
      },

      // Snap operations
      toggleSnap: () => {
        set(state => ({ snapEnabled: !state.snapEnabled }));
      },

      setSnapToFrames: (enabled: boolean) => {
        set({ snapToFrames: enabled });
      },

      setSnapToClips: (enabled: boolean) => {
        set({ snapToClips: enabled });
      },

      getSnappedTime: (time: number, excludeClipId?: string) => {
        const { project, snapEnabled, snapToFrames, snapToClips } = get();
        
        if (!snapEnabled || !project) {
          return time;
        }

        let snappedTime = time;
        const SNAP_THRESHOLD = 0.1; // seconds

        // Snap to frames
        if (snapToFrames) {
          snappedTime = snapToFrame(time, project.frameRate);
        }

        // Snap to clip edges
        if (snapToClips) {
          let closestDistance = SNAP_THRESHOLD;
          
          for (const track of project.tracks) {
            for (const clip of track.clips) {
              if (clip.id === excludeClipId) {
                continue;
              }
              
              const clipEnd = clip.startTime + clip.duration;
              
              // Snap to clip start
              const distToStart = Math.abs(time - clip.startTime);
              if (distToStart < closestDistance) {
                closestDistance = distToStart;
                snappedTime = clip.startTime;
              }
              
              // Snap to clip end
              const distToEnd = Math.abs(time - clipEnd);
              if (distToEnd < closestDistance) {
                closestDistance = distToEnd;
                snappedTime = clipEnd;
              }
            }
          }
        }

        return snappedTime;
      },

      // Utility functions
      getTrackById: (trackId: string) => {
        const { project } = get();
        return project?.tracks.find(t => t.id === trackId);
      },

      getClipById: (clipId: string) => {
        const { project } = get();
        if (!project) {
          return undefined;
        }

        for (const track of project.tracks) {
          const clip = track.clips.find(c => c.id === clipId);
          if (clip) {
            return { track, clip };
          }
        }
        return undefined;
      },

      getClipsAtTime: (time: number) => {
        const { project } = get();
        if (!project) {
          return [];
        }

        const result: Array<{ track: Track; clip: Clip }> = [];
        for (const track of project.tracks) {
          for (const clip of track.clips) {
            const clipEnd = clip.startTime + clip.duration;
            if (time >= clip.startTime && time < clipEnd) {
              result.push({ track, clip });
            }
          }
        }
        return result;
      },

      // Reset
      reset: () => {
        set({
          project: null,
          playback: INITIAL_PLAYBACK,
          viewport: INITIAL_VIEWPORT,
          selection: INITIAL_SELECTION,
          snapEnabled: true,
          snapToFrames: true,
          snapToClips: true,
          isLoading: false,
          error: null
        });
      }
    }),
    {
      limit: 100, // Undo history limit
      partialize: (state) => ({
        project: state.project
      })
    }
  )
);

// Export temporal hook for undo/redo
export const useTimelineHistory = <T>(
  selector: (state: TemporalState<Pick<TimelineStoreState, "project">>) => T
): T => {
  return useStoreWithEqualityFn(useTimelineStore.temporal, selector, isEqual);
};

// Export the temporal store for direct access
export const getTimelineHistoryState = () => useTimelineStore.temporal.getState();

export default useTimelineStore;
