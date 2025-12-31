import { act } from "@testing-library/react";
import useTimelineStore, { 
  TimelineProject, 
  Track, 
  Clip,
  TrackType,
  ClipType 
} from "../TimelineStore";

describe("TimelineStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    act(() => {
      useTimelineStore.getState().reset();
    });
  });

  describe("initial state", () => {
    it("has no project initially", () => {
      const { project } = useTimelineStore.getState();
      expect(project).toBeNull();
    });

    it("has default playback state", () => {
      const { playback } = useTimelineStore.getState();
      expect(playback.isPlaying).toBe(false);
      expect(playback.playheadPosition).toBe(0);
      expect(playback.loopEnabled).toBe(false);
    });

    it("has default viewport state", () => {
      const { viewport } = useTimelineStore.getState();
      expect(viewport.pixelsPerSecond).toBe(50);
      expect(viewport.scrollLeft).toBe(0);
    });

    it("has default selection state", () => {
      const { selection } = useTimelineStore.getState();
      expect(selection.selectedClipIds).toEqual([]);
      expect(selection.selectedTrackId).toBeNull();
    });

    it("has snap enabled by default", () => {
      const { snapEnabled, snapToFrames, snapToClips } = useTimelineStore.getState();
      expect(snapEnabled).toBe(true);
      expect(snapToFrames).toBe(true);
      expect(snapToClips).toBe(true);
    });
  });

  describe("project operations", () => {
    describe("createProject", () => {
      it("creates a new project with default settings", () => {
        act(() => {
          useTimelineStore.getState().createProject("Test Project");
        });

        const { project } = useTimelineStore.getState();
        expect(project).not.toBeNull();
        expect(project!.name).toBe("Test Project");
        expect(project!.frameRate).toBe(30);
        expect(project!.tracks).toEqual([]);
      });

      it("creates a project with custom frame rate", () => {
        act(() => {
          useTimelineStore.getState().createProject("Test Project", 60);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.frameRate).toBe(60);
      });

      it("resets playback state when creating project", () => {
        act(() => {
          useTimelineStore.getState().createProject("Test");
          useTimelineStore.getState().seek(10);
          useTimelineStore.getState().createProject("New Project");
        });

        const { playback } = useTimelineStore.getState();
        expect(playback.playheadPosition).toBe(0);
      });
    });

    describe("loadProject", () => {
      it("loads an existing project", () => {
        const testProject: TimelineProject = {
          id: "test-id",
          name: "Loaded Project",
          duration: 120,
          frameRate: 24,
          sampleRate: 48000,
          tracks: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        act(() => {
          useTimelineStore.getState().loadProject(testProject);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.name).toBe("Loaded Project");
        expect(project!.frameRate).toBe(24);
      });
    });
  });

  describe("track operations", () => {
    beforeEach(() => {
      act(() => {
        useTimelineStore.getState().createProject("Test Project");
      });
    });

    describe("addTrack", () => {
      it("adds an audio track", () => {
        let trackId: string;
        act(() => {
          trackId = useTimelineStore.getState().addTrack("audio");
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks).toHaveLength(1);
        expect(project!.tracks[0].type).toBe("audio");
        expect(project!.tracks[0].name).toBe("Audio 1");
      });

      it("adds a video track", () => {
        act(() => {
          useTimelineStore.getState().addTrack("video");
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].type).toBe("video");
        expect(project!.tracks[0].name).toBe("Video 1");
      });

      it("adds an image track", () => {
        act(() => {
          useTimelineStore.getState().addTrack("image");
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].type).toBe("image");
        expect(project!.tracks[0].name).toBe("Image 1");
      });

      it("increments track names for same type", () => {
        act(() => {
          useTimelineStore.getState().addTrack("audio");
          useTimelineStore.getState().addTrack("audio");
          useTimelineStore.getState().addTrack("audio");
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].name).toBe("Audio 1");
        expect(project!.tracks[1].name).toBe("Audio 2");
        expect(project!.tracks[2].name).toBe("Audio 3");
      });

      it("allows custom track name", () => {
        act(() => {
          useTimelineStore.getState().addTrack("audio", "My Custom Track");
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].name).toBe("My Custom Track");
      });

      it("sets default track properties", () => {
        act(() => {
          useTimelineStore.getState().addTrack("audio");
        });

        const { project } = useTimelineStore.getState();
        const track = project!.tracks[0];
        expect(track.muted).toBe(false);
        expect(track.solo).toBe(false);
        expect(track.locked).toBe(false);
        expect(track.visible).toBe(true);
        expect(track.clips).toEqual([]);
      });
    });

    describe("removeTrack", () => {
      it("removes a track by id", () => {
        let trackId: string;
        act(() => {
          trackId = useTimelineStore.getState().addTrack("audio");
          useTimelineStore.getState().removeTrack(trackId);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks).toHaveLength(0);
      });

      it("removes selected track from selection", () => {
        let trackId: string;
        act(() => {
          trackId = useTimelineStore.getState().addTrack("audio");
          useTimelineStore.getState().selectTrack(trackId);
          useTimelineStore.getState().removeTrack(trackId);
        });

        const { selection } = useTimelineStore.getState();
        expect(selection.selectedTrackId).toBeNull();
      });
    });

    describe("updateTrack", () => {
      it("updates track properties", () => {
        let trackId: string;
        act(() => {
          trackId = useTimelineStore.getState().addTrack("audio");
          useTimelineStore.getState().updateTrack(trackId, { name: "Updated Name" });
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].name).toBe("Updated Name");
      });
    });

    describe("toggle functions", () => {
      let trackId: string;

      beforeEach(() => {
        act(() => {
          trackId = useTimelineStore.getState().addTrack("audio");
        });
      });

      it("toggles mute", () => {
        act(() => {
          useTimelineStore.getState().toggleTrackMute(trackId);
        });

        let { project } = useTimelineStore.getState();
        expect(project!.tracks[0].muted).toBe(true);

        act(() => {
          useTimelineStore.getState().toggleTrackMute(trackId);
        });

        project = useTimelineStore.getState().project;
        expect(project!.tracks[0].muted).toBe(false);
      });

      it("toggles solo", () => {
        act(() => {
          useTimelineStore.getState().toggleTrackSolo(trackId);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].solo).toBe(true);
      });

      it("toggles lock", () => {
        act(() => {
          useTimelineStore.getState().toggleTrackLock(trackId);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].locked).toBe(true);
      });

      it("toggles visibility", () => {
        act(() => {
          useTimelineStore.getState().toggleTrackVisibility(trackId);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].visible).toBe(false);
      });
    });

    describe("reorderTrack", () => {
      it("reorders tracks", () => {
        let trackId1: string, trackId2: string, trackId3: string;
        act(() => {
          trackId1 = useTimelineStore.getState().addTrack("video");
          trackId2 = useTimelineStore.getState().addTrack("audio");
          trackId3 = useTimelineStore.getState().addTrack("image");
          useTimelineStore.getState().reorderTrack(trackId3, 0);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].type).toBe("image");
        expect(project!.tracks[1].type).toBe("video");
        expect(project!.tracks[2].type).toBe("audio");
      });
    });
  });

  describe("clip operations", () => {
    let trackId: string;

    beforeEach(() => {
      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        trackId = useTimelineStore.getState().addTrack("audio");
      });
    });

    const createTestClip = (startTime: number = 0, duration: number = 5): Omit<Clip, "id"> => ({
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

    describe("addClip", () => {
      it("adds a clip to a track", () => {
        let clipId: string | null;
        act(() => {
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip());
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].clips).toHaveLength(1);
        expect(project!.tracks[0].clips[0].name).toBe("Test Clip");
      });

      it("prevents overlapping clips", () => {
        let clipId1: string | null, clipId2: string | null;
        act(() => {
          clipId1 = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
          clipId2 = useTimelineStore.getState().addClip(trackId, createTestClip(2, 5));
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].clips).toHaveLength(1);
      });

      it("allows non-overlapping clips", () => {
        act(() => {
          useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
          useTimelineStore.getState().addClip(trackId, createTestClip(5, 5));
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].clips).toHaveLength(2);
      });

      it("returns null for locked tracks", () => {
        let clipId: string | null = null;
        act(() => {
          useTimelineStore.getState().toggleTrackLock(trackId);
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip());
        });

        expect(clipId).toBeNull();
      });
    });

    describe("removeClip", () => {
      it("removes a clip from a track", () => {
        let clipId: string | null = null;
        act(() => {
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip());
          useTimelineStore.getState().removeClip(trackId, clipId!);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].clips).toHaveLength(0);
      });

      it("removes clip from selection", () => {
        let clipId: string | null = null;
        act(() => {
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip());
          useTimelineStore.getState().selectClip(clipId!);
          useTimelineStore.getState().removeClip(trackId, clipId!);
        });

        const { selection } = useTimelineStore.getState();
        expect(selection.selectedClipIds).not.toContain(clipId);
      });
    });

    describe("moveClip", () => {
      it("moves clip to new position on same track", () => {
        let clipId: string | null;
        act(() => {
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
          useTimelineStore.getState().moveClip(trackId, clipId!, trackId, 10);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].clips[0].startTime).toBe(10);
      });

      it("moves clip to different track of same type", () => {
        let clipId: string | null, trackId2: string;
        act(() => {
          trackId2 = useTimelineStore.getState().addTrack("audio");
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
          useTimelineStore.getState().moveClip(trackId, clipId!, trackId2, 0);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].clips).toHaveLength(0);
        expect(project!.tracks[1].clips).toHaveLength(1);
      });

      it("prevents moving clip to different track type", () => {
        let clipId: string | null, videoTrackId: string;
        act(() => {
          videoTrackId = useTimelineStore.getState().addTrack("video");
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
          useTimelineStore.getState().moveClip(trackId, clipId!, videoTrackId, 0);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].clips).toHaveLength(1); // Clip stays on audio track
        expect(project!.tracks[1].clips).toHaveLength(0); // Video track empty
      });
    });

    describe("trimClipStart", () => {
      it("trims clip start", () => {
        let clipId: string | null;
        act(() => {
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 10));
          useTimelineStore.getState().trimClipStart(trackId, clipId!, 2);
        });

        const { project } = useTimelineStore.getState();
        const clip = project!.tracks[0].clips[0];
        expect(clip.startTime).toBe(2);
        expect(clip.duration).toBe(8);
        expect(clip.inPoint).toBe(2);
      });
    });

    describe("trimClipEnd", () => {
      it("trims clip end", () => {
        let clipId: string | null;
        act(() => {
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 10));
          useTimelineStore.getState().trimClipEnd(trackId, clipId!, 8);
        });

        const { project } = useTimelineStore.getState();
        const clip = project!.tracks[0].clips[0];
        expect(clip.duration).toBe(8);
        expect(clip.outPoint).toBe(8);
      });
    });

    describe("splitClip", () => {
      it("splits clip at specified time", () => {
        let clipId: string | null;
        act(() => {
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 10));
          useTimelineStore.getState().splitClip(trackId, clipId!, 5);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].clips).toHaveLength(2);
        expect(project!.tracks[0].clips[0].duration).toBe(5);
        expect(project!.tracks[0].clips[1].startTime).toBe(5);
        expect(project!.tracks[0].clips[1].duration).toBe(5);
      });

      it("returns null for split outside clip bounds", () => {
        let clipId: string | null = null;
        let splitId: string | null = null;
        act(() => {
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 10));
          splitId = useTimelineStore.getState().splitClip(trackId, clipId!, 15);
        });

        expect(splitId).toBeNull();
      });
    });

    describe("duplicateClip", () => {
      it("duplicates a clip", () => {
        let clipId: string | null;
        act(() => {
          clipId = useTimelineStore.getState().addClip(trackId, createTestClip(0, 5));
          useTimelineStore.getState().duplicateClip(trackId, clipId!);
        });

        const { project } = useTimelineStore.getState();
        expect(project!.tracks[0].clips).toHaveLength(2);
        expect(project!.tracks[0].clips[1].startTime).toBe(5);
      });
    });
  });

  describe("playback operations", () => {
    beforeEach(() => {
      act(() => {
        useTimelineStore.getState().createProject("Test Project");
      });
    });

    it("plays and pauses", () => {
      act(() => {
        useTimelineStore.getState().play();
      });

      expect(useTimelineStore.getState().playback.isPlaying).toBe(true);

      act(() => {
        useTimelineStore.getState().pause();
      });

      expect(useTimelineStore.getState().playback.isPlaying).toBe(false);
    });

    it("toggles playback", () => {
      act(() => {
        useTimelineStore.getState().togglePlayback();
      });

      expect(useTimelineStore.getState().playback.isPlaying).toBe(true);

      act(() => {
        useTimelineStore.getState().togglePlayback();
      });

      expect(useTimelineStore.getState().playback.isPlaying).toBe(false);
    });

    it("stops and resets position", () => {
      act(() => {
        useTimelineStore.getState().play();
        useTimelineStore.getState().seek(10);
        useTimelineStore.getState().stop();
      });

      const { playback } = useTimelineStore.getState();
      expect(playback.isPlaying).toBe(false);
      expect(playback.playheadPosition).toBe(0);
    });

    it("seeks to position", () => {
      act(() => {
        useTimelineStore.getState().seek(10);
      });

      expect(useTimelineStore.getState().playback.playheadPosition).toBe(10);
    });

    it("clamps seek position to project duration", () => {
      act(() => {
        useTimelineStore.getState().seek(1000);
      });

      const { project, playback } = useTimelineStore.getState();
      expect(playback.playheadPosition).toBe(project!.duration);
    });

    it("seeks relatively", () => {
      act(() => {
        useTimelineStore.getState().seek(5);
        useTimelineStore.getState().seekRelative(2);
      });

      expect(useTimelineStore.getState().playback.playheadPosition).toBe(7);
    });

    it("steps frame forward and backward", () => {
      act(() => {
        useTimelineStore.getState().stepFrame(1);
      });

      const { project, playback } = useTimelineStore.getState();
      const expectedTime = 1 / project!.frameRate;
      expect(playback.playheadPosition).toBeCloseTo(expectedTime, 5);

      act(() => {
        useTimelineStore.getState().stepFrame(-1);
      });

      expect(useTimelineStore.getState().playback.playheadPosition).toBeCloseTo(0, 5);
    });

    describe("loop", () => {
      it("sets loop region", () => {
        act(() => {
          useTimelineStore.getState().setLoopRegion(5, 10);
        });

        const { playback } = useTimelineStore.getState();
        expect(playback.loopEnabled).toBe(true);
        expect(playback.loopStart).toBe(5);
        expect(playback.loopEnd).toBe(10);
      });

      it("toggles loop", () => {
        act(() => {
          useTimelineStore.getState().toggleLoop();
        });

        expect(useTimelineStore.getState().playback.loopEnabled).toBe(true);
      });

      it("clears loop region", () => {
        act(() => {
          useTimelineStore.getState().setLoopRegion(5, 10);
          useTimelineStore.getState().clearLoopRegion();
        });

        const { playback } = useTimelineStore.getState();
        expect(playback.loopEnabled).toBe(false);
        expect(playback.loopStart).toBe(0);
        expect(playback.loopEnd).toBe(0);
      });
    });
  });

  describe("viewport operations", () => {
    beforeEach(() => {
      act(() => {
        useTimelineStore.getState().createProject("Test Project");
      });
    });

    it("sets zoom level", () => {
      act(() => {
        useTimelineStore.getState().setZoom(100);
      });

      expect(useTimelineStore.getState().viewport.pixelsPerSecond).toBe(100);
    });

    it("clamps zoom to valid range", () => {
      act(() => {
        useTimelineStore.getState().setZoom(1);
      });

      expect(useTimelineStore.getState().viewport.pixelsPerSecond).toBe(10); // MIN_ZOOM

      act(() => {
        useTimelineStore.getState().setZoom(1000);
      });

      expect(useTimelineStore.getState().viewport.pixelsPerSecond).toBe(500); // MAX_ZOOM
    });

    it("zooms in and out", () => {
      const initialZoom = useTimelineStore.getState().viewport.pixelsPerSecond;

      act(() => {
        useTimelineStore.getState().zoomIn();
      });

      expect(useTimelineStore.getState().viewport.pixelsPerSecond).toBeGreaterThan(initialZoom);

      act(() => {
        useTimelineStore.getState().zoomOut();
        useTimelineStore.getState().zoomOut();
      });

      expect(useTimelineStore.getState().viewport.pixelsPerSecond).toBeLessThan(initialZoom);
    });

    it("sets scroll position", () => {
      act(() => {
        useTimelineStore.getState().setScrollLeft(100);
      });

      expect(useTimelineStore.getState().viewport.scrollLeft).toBe(100);
    });

    it("prevents negative scroll", () => {
      act(() => {
        useTimelineStore.getState().setScrollLeft(-50);
      });

      expect(useTimelineStore.getState().viewport.scrollLeft).toBe(0);
    });
  });

  describe("selection operations", () => {
    let trackId: string;
    let clipId: string | null;

    beforeEach(() => {
      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        trackId = useTimelineStore.getState().addTrack("audio");
        clipId = useTimelineStore.getState().addClip(trackId, {
          type: "audio",
          sourceRef: null,
          sourceUrl: "test.mp3",
          name: "Test",
          startTime: 0,
          duration: 5,
          inPoint: 0,
          outPoint: 5,
          sourceDuration: 5,
          speed: 1
        });
      });
    });

    it("selects a clip", () => {
      act(() => {
        useTimelineStore.getState().selectClip(clipId!);
      });

      expect(useTimelineStore.getState().selection.selectedClipIds).toContain(clipId);
    });

    it("adds clip to selection with addToSelection", () => {
      let clipId2: string | null = null;
      act(() => {
        clipId2 = useTimelineStore.getState().addClip(trackId, {
          type: "audio",
          sourceRef: null,
          sourceUrl: "test2.mp3",
          name: "Test 2",
          startTime: 5,
          duration: 5,
          inPoint: 0,
          outPoint: 5,
          sourceDuration: 5,
          speed: 1
        });
        useTimelineStore.getState().selectClip(clipId!);
        useTimelineStore.getState().selectClip(clipId2!, true);
      });

      const { selection } = useTimelineStore.getState();
      expect(selection.selectedClipIds).toContain(clipId);
      expect(selection.selectedClipIds).toContain(clipId2);
    });

    it("deselects a clip", () => {
      act(() => {
        useTimelineStore.getState().selectClip(clipId!);
        useTimelineStore.getState().deselectClip(clipId!);
      });

      expect(useTimelineStore.getState().selection.selectedClipIds).not.toContain(clipId);
    });

    it("clears clip selection", () => {
      act(() => {
        useTimelineStore.getState().selectClip(clipId!);
        useTimelineStore.getState().clearClipSelection();
      });

      expect(useTimelineStore.getState().selection.selectedClipIds).toHaveLength(0);
    });

    it("selects a track", () => {
      act(() => {
        useTimelineStore.getState().selectTrack(trackId);
      });

      expect(useTimelineStore.getState().selection.selectedTrackId).toBe(trackId);
    });

    it("sets time selection", () => {
      act(() => {
        useTimelineStore.getState().setTimeSelection(5, 10);
      });

      const { selection } = useTimelineStore.getState();
      expect(selection.selectionStart).toBe(5);
      expect(selection.selectionEnd).toBe(10);
    });
  });

  describe("snap operations", () => {
    beforeEach(() => {
      act(() => {
        useTimelineStore.getState().createProject("Test Project");
      });
    });

    it("toggles snap", () => {
      act(() => {
        useTimelineStore.getState().toggleSnap();
      });

      expect(useTimelineStore.getState().snapEnabled).toBe(false);
    });

    it("sets snap to frames", () => {
      act(() => {
        useTimelineStore.getState().setSnapToFrames(false);
      });

      expect(useTimelineStore.getState().snapToFrames).toBe(false);
    });

    it("sets snap to clips", () => {
      act(() => {
        useTimelineStore.getState().setSnapToClips(false);
      });

      expect(useTimelineStore.getState().snapToClips).toBe(false);
    });

    it("snaps time to frame boundaries", () => {
      const snappedTime = useTimelineStore.getState().getSnappedTime(1.23);
      // At 30fps, should snap to nearest frame
      expect(snappedTime % (1/30)).toBeLessThan(0.001);
    });

    it("returns original time when snap disabled", () => {
      act(() => {
        useTimelineStore.getState().toggleSnap();
      });

      const snappedTime = useTimelineStore.getState().getSnappedTime(1.23);
      expect(snappedTime).toBe(1.23);
    });
  });

  describe("utility functions", () => {
    let trackId: string;
    let clipId: string | null;

    beforeEach(() => {
      act(() => {
        useTimelineStore.getState().createProject("Test Project");
        trackId = useTimelineStore.getState().addTrack("audio");
        clipId = useTimelineStore.getState().addClip(trackId, {
          type: "audio",
          sourceRef: null,
          sourceUrl: "test.mp3",
          name: "Test",
          startTime: 5,
          duration: 10,
          inPoint: 0,
          outPoint: 10,
          sourceDuration: 10,
          speed: 1
        });
      });
    });

    it("gets track by id", () => {
      const track = useTimelineStore.getState().getTrackById(trackId);
      expect(track).toBeDefined();
      expect(track!.id).toBe(trackId);
    });

    it("gets clip by id", () => {
      const result = useTimelineStore.getState().getClipById(clipId!);
      expect(result).toBeDefined();
      expect(result!.clip.id).toBe(clipId);
      expect(result!.track.id).toBe(trackId);
    });

    it("gets clips at time", () => {
      const clips = useTimelineStore.getState().getClipsAtTime(10);
      expect(clips).toHaveLength(1);
      expect(clips[0].clip.id).toBe(clipId);
    });

    it("returns empty array for time with no clips", () => {
      const clips = useTimelineStore.getState().getClipsAtTime(0);
      expect(clips).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("resets all state to initial values", () => {
      act(() => {
        useTimelineStore.getState().createProject("Test");
        useTimelineStore.getState().addTrack("audio");
        useTimelineStore.getState().seek(10);
        useTimelineStore.getState().reset();
      });

      const state = useTimelineStore.getState();
      expect(state.project).toBeNull();
      expect(state.playback.playheadPosition).toBe(0);
      expect(state.selection.selectedClipIds).toHaveLength(0);
    });
  });
});
