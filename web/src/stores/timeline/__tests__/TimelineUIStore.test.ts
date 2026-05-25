import { describe, expect, it, beforeEach } from "@jest/globals";
import { useTimelineUIStore } from "../TimelineUIStore";

describe("TimelineUIStore — activeTool", () => {
  beforeEach(() => {
    useTimelineUIStore.setState({ activeTool: "select" });
  });

  it("defaults to 'select'", () => {
    expect(useTimelineUIStore.getState().activeTool).toBe("select");
  });

  it("setActiveTool('cut') switches the tool", () => {
    useTimelineUIStore.getState().setActiveTool("cut");
    expect(useTimelineUIStore.getState().activeTool).toBe("cut");
  });

  it("setActiveTool('select') switches back", () => {
    useTimelineUIStore.getState().setActiveTool("cut");
    useTimelineUIStore.getState().setActiveTool("select");
    expect(useTimelineUIStore.getState().activeTool).toBe("select");
  });
});
