/**
 * @jest-environment jsdom
 *
 * Headless parity during setup (PRD § 6.5).
 *
 * The editor surface is never mounted here — only the registration a setup host
 * makes. If the tools reached the board only through `StoryboardSurface`, a
 * creator who asked the agent to advance the flow would be told no storyboard
 * is open, which is the failure this suite exists to catch.
 */
import { renderHook, act } from "@testing-library/react";
import type { Shot } from "@nodetool-ai/protocol";

jest.mock("../useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: jest.fn(),
    generateClip: jest.fn(),
    generateRevisedClip: jest.fn()
  })
}));
jest.mock("../useAssembleTimeline", () => ({
  useAssembleTimeline: () => ({ assemble: jest.fn() })
}));
jest.mock("../useExtractScriptFromBoard", () => ({
  useExtractScriptFromBoard: () => ({ extract: jest.fn() })
}));
jest.mock("../useReprojectShots", () => ({
  useReprojectShots: () => ({ reproject: jest.fn() })
}));
jest.mock("../useDirectScreenplay", () => ({
  useDirectScreenplay: () => ({ direct: jest.fn() })
}));
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

import { FrontendToolRegistry } from "../../../lib/tools/frontendTools";
import type { FrontendToolState } from "../../../lib/tools/frontendTools";
import { hasStoryboardAgentHandler } from "../../../components/storyboard/storyboardAgentBridge";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardAgentBridge } from "../useStoryboardAgentBridge";
import "../../../lib/tools/builtin/storyboard";

const BOARD = "board-setup";
const ctx = { getState: () => ({}) as FrontendToolState };

const call = (name: string, args: Record<string, unknown>): Promise<unknown> =>
  FrontendToolRegistry.call(
    name,
    { storyboard_id: BOARD, ...args },
    `tc-${name}`,
    ctx
  );

const board = (): StoryboardBoard => {
  const found = useStoryboardStore.getState().getBoard(BOARD);
  if (!found) throw new Error("board vanished");
  return found;
};

/** A board mid-setup: directed, styled by the Director, not yet finished. */
const seed = (): void => {
  useStoryboardStore.getState().loadBoard(BOARD, {
    screenplay: null,
    shots: [] as Shot[],
    title: "Dark Water",
    brief: "A lighthouse keeper loses the light.",
    style: "grainy 16mm",
    entityIds: [],
    aspectRatio: "16:9",
    setupStage: "idea",
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null
  });
};

beforeEach(() => {
  useStoryboardStore.setState({ boards: {}, history: {} } as never);
  seed();
});

describe("the agent bridge a setup host registers", () => {
  it("lets ui_storyboard_set_setup advance the stage while the flow is mounted", async () => {
    renderHook(() => useStoryboardAgentBridge(BOARD));

    expect(board().setupStage).toBe("idea");
    await act(async () => {
      await call("ui_storyboard_set_setup", { stage: "genre" });
    });

    expect(board().setupStage).toBe("genre");
  });

  it("writes brief and genre through the same call", async () => {
    renderHook(() => useStoryboardAgentBridge(BOARD));

    await act(async () => {
      await call("ui_storyboard_set_setup", {
        brief: "A ferry captain loses the tide.",
        genre: "Thriller",
        stage: "look"
      });
    });

    expect(board().brief).toBe("A ferry captain loses the tide.");
    expect(board().genre).toBe("Thriller");
    expect(board().setupStage).toBe("look");
  });

  it("clears the registration when the flow unmounts", () => {
    const { unmount } = renderHook(() => useStoryboardAgentBridge(BOARD));
    expect(hasStoryboardAgentHandler(BOARD)).toBe(true);

    unmount();
    expect(hasStoryboardAgentHandler(BOARD)).toBe(false);
  });

  it("registers nothing before the host has a board id", () => {
    renderHook(() => useStoryboardAgentBridge(""));
    expect(hasStoryboardAgentHandler("")).toBe(false);
  });
});
