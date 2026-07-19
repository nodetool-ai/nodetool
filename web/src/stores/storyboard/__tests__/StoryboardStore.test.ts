import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useStoryboardStore } from "../StoryboardStore";
import type { Shot } from "@nodetool-ai/protocol";

const makeShot = (id: string, overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id,
  index: 0,
  status: "planned",
  action: `Action for ${id}`,
  ...overrides
});

describe("StoryboardStore", () => {
  beforeEach(() => {
    act(() => {
      useStoryboardStore.setState({ boards: {}, serverRevisions: {} });
    });
  });

  describe("ensureBoard", () => {
    it("should create an empty board for a new id", () => {
      act(() => {
        useStoryboardStore.getState().ensureBoard("board-1");
      });
      const board = useStoryboardStore.getState().boards["board-1"];
      expect(board).toBeDefined();
      expect(board.id).toBe("board-1");
      expect(board.shots).toEqual([]);
      expect(board.screenplay).toBeNull();
      expect(board.aspectRatio).toBe("16:9");
    });

    it("should not overwrite an existing board", () => {
      act(() => {
        useStoryboardStore.getState().ensureBoard("board-1");
        useStoryboardStore.getState().setBrief("board-1", "my brief");
        useStoryboardStore.getState().ensureBoard("board-1");
      });
      expect(useStoryboardStore.getState().boards["board-1"].brief).toBe(
        "my brief"
      );
    });
  });

  describe("removeBoard", () => {
    it("should remove an existing board", () => {
      act(() => {
        useStoryboardStore.getState().ensureBoard("board-1");
        useStoryboardStore.getState().removeBoard("board-1");
      });
      expect(useStoryboardStore.getState().boards["board-1"]).toBeUndefined();
    });

    it("should be a no-op for a missing board", () => {
      const before = useStoryboardStore.getState();
      act(() => {
        useStoryboardStore.getState().removeBoard("nonexistent");
      });
      expect(useStoryboardStore.getState().boards).toBe(before.boards);
    });
  });

  describe("setBrief / setStyle / setTitle / setAspectRatio", () => {
    beforeEach(() => {
      act(() => {
        useStoryboardStore.getState().ensureBoard("b");
      });
    });

    it("should update the brief", () => {
      act(() => {
        useStoryboardStore.getState().setBrief("b", "new brief");
      });
      expect(useStoryboardStore.getState().boards["b"].brief).toBe("new brief");
    });

    it("should update the style", () => {
      act(() => {
        useStoryboardStore.getState().setStyle("b", "cinematic noir");
      });
      expect(useStoryboardStore.getState().boards["b"].style).toBe(
        "cinematic noir"
      );
    });

    it("should update the title", () => {
      act(() => {
        useStoryboardStore.getState().setTitle("b", "My Film");
      });
      expect(useStoryboardStore.getState().boards["b"].title).toBe("My Film");
    });

    it("should update the aspect ratio", () => {
      act(() => {
        useStoryboardStore.getState().setAspectRatio("b", "9:16");
      });
      expect(useStoryboardStore.getState().boards["b"].aspectRatio).toBe(
        "9:16"
      );
    });

    it("should be a no-op when setting the same value", () => {
      act(() => {
        useStoryboardStore.getState().setBrief("b", "same");
      });
      const before = useStoryboardStore.getState().boards["b"];
      act(() => {
        useStoryboardStore.getState().setBrief("b", "same");
      });
      expect(useStoryboardStore.getState().boards["b"]).toBe(before);
    });
  });

  describe("upsertShot", () => {
    beforeEach(() => {
      act(() => {
        useStoryboardStore.getState().ensureBoard("b");
      });
    });

    it("should add a new shot", () => {
      act(() => {
        useStoryboardStore.getState().upsertShot("b", makeShot("s1"));
      });
      expect(useStoryboardStore.getState().boards["b"].shots).toHaveLength(1);
      expect(useStoryboardStore.getState().boards["b"].shots[0].id).toBe("s1");
    });

    it("should replace an existing shot by id", () => {
      act(() => {
        useStoryboardStore.getState().upsertShot("b", makeShot("s1"));
        useStoryboardStore
          .getState()
          .upsertShot("b", makeShot("s1", { action: "updated action" }));
      });
      const shots = useStoryboardStore.getState().boards["b"].shots;
      expect(shots).toHaveLength(1);
      expect(shots[0].action).toBe("updated action");
    });
  });

  describe("removeShot", () => {
    it("should remove a shot by id", () => {
      act(() => {
        useStoryboardStore.getState().ensureBoard("b");
        useStoryboardStore.getState().upsertShot("b", makeShot("s1"));
        useStoryboardStore.getState().upsertShot("b", makeShot("s2"));
        useStoryboardStore.getState().removeShot("b", "s1");
      });
      const shots = useStoryboardStore.getState().boards["b"].shots;
      expect(shots).toHaveLength(1);
      expect(shots[0].id).toBe("s2");
    });
  });

  describe("getBoard", () => {
    it("should return undefined for missing boards", () => {
      expect(useStoryboardStore.getState().getBoard("nope")).toBeUndefined();
    });

    it("should return the board when it exists", () => {
      act(() => {
        useStoryboardStore.getState().ensureBoard("b");
      });
      expect(useStoryboardStore.getState().getBoard("b")?.id).toBe("b");
    });
  });

  describe("setServerRevision", () => {
    it("should set a revision", () => {
      act(() => {
        useStoryboardStore.getState().setServerRevision("b", "rev-1");
      });
      expect(useStoryboardStore.getState().serverRevisions["b"]).toBe("rev-1");
    });

    it("should delete a revision when set to null", () => {
      act(() => {
        useStoryboardStore.getState().setServerRevision("b", "rev-1");
        useStoryboardStore.getState().setServerRevision("b", null);
      });
      expect(useStoryboardStore.getState().serverRevisions["b"]).toBeUndefined();
    });
  });

  describe("setTimelineLink", () => {
    it("should set the timeline id on a board", () => {
      act(() => {
        useStoryboardStore.getState().ensureBoard("b");
        useStoryboardStore.getState().setTimelineLink("b", "tl-1");
      });
      expect(useStoryboardStore.getState().boards["b"].timelineId).toBe("tl-1");
    });

    it("should clear the timeline link when null", () => {
      act(() => {
        useStoryboardStore.getState().ensureBoard("b");
        useStoryboardStore.getState().setTimelineLink("b", "tl-1");
        useStoryboardStore.getState().setTimelineLink("b", null);
      });
      expect(useStoryboardStore.getState().boards["b"].timelineId).toBeNull();
    });
  });
});
