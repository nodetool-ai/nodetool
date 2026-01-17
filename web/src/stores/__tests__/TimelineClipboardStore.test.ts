import { act } from "@testing-library/react";
import { useTimelineClipboardStore } from "../TimelineClipboardStore";
import useTimelineStore, { Clip, ClipType } from "../TimelineStore";

describe("TimelineClipboardStore", () => {
  beforeEach(() => {
    // Reset stores to initial state
    act(() => {
      useTimelineStore.getState().reset();
      useTimelineClipboardStore.getState().clearClipboard();
    });
  });

  const createTestClip = (
    startTime: number = 0,
    duration: number = 5
  ): Omit<Clip, "id"> => ({
    type: "audio" as ClipType,
    sourceRef: null,
    sourceUrl: "test.mp3",
    name: "Test Clip",
    startTime,
    duration,
    inPoint: 0,
    outPoint: duration,
    sourceDuration: duration,
    speed: 1
  });

  describe("initial state", () => {
    it("has empty clipboard", () => {
      const { clipboardClips, isCut, cutClipIds } =
        useTimelineClipboardStore.getState();
      expect(clipboardClips).toEqual([]);
      expect(isCut).toBe(false);
      expect(cutClipIds).toEqual([]);
    });

    it("hasClips returns false when empty", () => {
      const { hasClips } = useTimelineClipboardStore.getState();
      expect(hasClips()).toBe(false);
    });
  });

  describe("copySelectedClips", () => {
    it("copies selected clips to clipboard", () => {
      let clipId: string | null;
      let trackId: string;

      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        trackId = useTimelineStore.getState().addTrack("audio");
        clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
        useTimelineStore.getState().selectClip(clipId!);
        useTimelineClipboardStore.getState().copySelectedClips();
      });

      const { clipboardClips, isCut, hasClips } =
        useTimelineClipboardStore.getState();

      expect(clipboardClips).toHaveLength(1);
      expect(clipboardClips[0].clip.name).toBe("Test Clip");
      expect(clipboardClips[0].trackType).toBe("audio");
      expect(clipboardClips[0].relativeStartTime).toBe(0);
      expect(isCut).toBe(false);
      expect(hasClips()).toBe(true);
    });

    it("does nothing if no clips are selected", () => {
      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        useTimelineClipboardStore.getState().copySelectedClips();
      });

      const { clipboardClips } = useTimelineClipboardStore.getState();
      expect(clipboardClips).toHaveLength(0);
    });

    it("copies multiple clips with relative offsets", () => {
      let clipId1: string | null;
      let clipId2: string | null;
      let trackId: string;

      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        trackId = useTimelineStore.getState().addTrack("audio");
        clipId1 = useTimelineStore.getState().addClip(trackId, createTestClip(5, 5));
        clipId2 = useTimelineStore.getState().addClip(trackId, createTestClip(15, 5));
        useTimelineStore.getState().selectClip(clipId1!);
        useTimelineStore.getState().selectClip(clipId2!, true);
        useTimelineClipboardStore.getState().copySelectedClips();
      });

      const { clipboardClips } = useTimelineClipboardStore.getState();

      expect(clipboardClips).toHaveLength(2);
      // First clip should have relative offset 0
      expect(clipboardClips[0].relativeStartTime).toBe(0);
      // Second clip should have relative offset 10 (15 - 5)
      expect(clipboardClips[1].relativeStartTime).toBe(10);
    });
  });

  describe("cutSelectedClips", () => {
    it("cuts selected clips", () => {
      let clipId: string | null = null;
      let trackId: string = "";

      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        trackId = useTimelineStore.getState().addTrack("audio");
        clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
        useTimelineStore.getState().selectClip(clipId!);
        useTimelineClipboardStore.getState().cutSelectedClips();
      });

      const { clipboardClips, isCut, cutClipIds } =
        useTimelineClipboardStore.getState();

      expect(clipboardClips).toHaveLength(1);
      expect(isCut).toBe(true);
      expect(cutClipIds).toHaveLength(1);
      expect(cutClipIds[0].clipId).toBe(clipId);
    });
  });

  describe("pasteClips", () => {
    it("pastes clips at playhead position", () => {
      let clipId: string | null;
      let trackId: string;

      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        trackId = useTimelineStore.getState().addTrack("audio");
        clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
        useTimelineStore.getState().selectClip(clipId!);
        useTimelineClipboardStore.getState().copySelectedClips();
        // Move playhead
        useTimelineStore.getState().seek(10);
        // Paste
        useTimelineClipboardStore.getState().pasteClips();
      });

      const { project } = useTimelineStore.getState();
      expect(project!.tracks[0].clips).toHaveLength(2);
      expect(project!.tracks[0].clips[1].startTime).toBe(10);
    });

    it("removes original clips when pasting after cut", () => {
      let clipId: string | null;
      let trackId: string;

      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        trackId = useTimelineStore.getState().addTrack("audio");
        clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
        useTimelineStore.getState().selectClip(clipId!);
        useTimelineClipboardStore.getState().cutSelectedClips();
        // Move playhead
        useTimelineStore.getState().seek(10);
        // Paste
        useTimelineClipboardStore.getState().pasteClips();
      });

      const { project } = useTimelineStore.getState();
      // Should only have 1 clip (the pasted one, original removed)
      expect(project!.tracks[0].clips).toHaveLength(1);
      expect(project!.tracks[0].clips[0].startTime).toBe(10);

      // Should clear cut state
      const { isCut, cutClipIds } = useTimelineClipboardStore.getState();
      expect(isCut).toBe(false);
      expect(cutClipIds).toHaveLength(0);
    });

    it("does nothing if clipboard is empty", () => {
      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        useTimelineStore.getState().addTrack("audio");
        useTimelineClipboardStore.getState().pasteClips();
      });

      const { project } = useTimelineStore.getState();
      expect(project!.tracks[0].clips).toHaveLength(0);
    });

    it("selects pasted clips", () => {
      let clipId: string | null;
      let trackId: string;

      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        trackId = useTimelineStore.getState().addTrack("audio");
        clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
        useTimelineStore.getState().selectClip(clipId!);
        useTimelineClipboardStore.getState().copySelectedClips();
        useTimelineStore.getState().seek(10);
        useTimelineClipboardStore.getState().pasteClips();
      });

      const { selection, project } = useTimelineStore.getState();
      // Should select the newly pasted clip
      expect(selection.selectedClipIds).toHaveLength(1);
      expect(selection.selectedClipIds[0]).toBe(project!.tracks[0].clips[1].id);
    });
  });

  describe("clearClipboard", () => {
    it("clears the clipboard", () => {
      let clipId: string | null;
      let trackId: string;

      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        trackId = useTimelineStore.getState().addTrack("audio");
        clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
        useTimelineStore.getState().selectClip(clipId!);
        useTimelineClipboardStore.getState().cutSelectedClips();
        useTimelineClipboardStore.getState().clearClipboard();
      });

      const { clipboardClips, isCut, cutClipIds, hasClips } =
        useTimelineClipboardStore.getState();

      expect(clipboardClips).toHaveLength(0);
      expect(isCut).toBe(false);
      expect(cutClipIds).toHaveLength(0);
      expect(hasClips()).toBe(false);
    });
  });
});
