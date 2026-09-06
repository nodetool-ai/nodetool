/**
 * @jest-environment jsdom
 *
 * Criterion 5, second half, and criterion 6: `Voice your script` binds one
 * voice per speaker and voices every line exactly once — and the same result
 * is reachable through the § 9.6 tools rather than through the buttons.
 *
 * This drives the real `ui_script_*` frontend tools against the real agent
 * bridge and the real store, so the only thing standing in for production is
 * the WebSocket RPC. Counting the `generate_media` calls is what pins "exactly
 * once": a second take per line is money spent twice.
 */
import { act, renderHook } from "@testing-library/react";

const rpcRequest = jest.fn();
jest.mock("../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-test"
}));

// The bridge also wires the timeline handoff and the storyboard derive, both
// of which reach tRPC; neither is exercised here.
jest.mock("../../../../hooks/script/useAssembleScriptTimeline", () => ({
  useAssembleScriptTimeline: () => ({ assemble: jest.fn(), assembling: false, error: null })
}));
jest.mock("../../../../hooks/script/useDeriveStoryboard", () => ({
  useDeriveStoryboard: () => ({ derive: jest.fn(), deriving: false, error: null })
}));

import { FrontendToolRegistry } from "../../../../lib/tools/frontendTools";
import "../../../../lib/tools/builtin/script";
import { useScriptAgentBridge } from "../../../../hooks/script/useScriptAgentBridge";
import { useScriptStore } from "../../../../stores/script/ScriptStore";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";
import { readVoicingRun } from "../../../../stores/script/scriptVoicing";

const SCRIPT_ID = "s-tools";

/** The script tools never read workflow state, so a bare stub satisfies ctx. */
let callSeq = 0;
const call = async (
  name: string,
  args: Record<string, unknown>
): Promise<unknown> => {
  let result: unknown;
  // The tools drive hooks that hold React state, so a call is an act.
  await act(async () => {
    result = await FrontendToolRegistry.call(
      name,
      { script_id: SCRIPT_ID, ...args },
      `call-${++callSeq}`,
      { getState: () => ({}) as never }
    );
  });
  return result;
};

const RACHEL = { provider: "elevenlabs", model: "eleven_v3", voice: "rachel" };
const ADAM = { provider: "elevenlabs", model: "eleven_v3", voice: "adam" };

/** The writer's answer: two speakers, three lines. */
const writerAnswer = {
  text: "",
  data: {
    speakers: [{ name: "Host" }, { name: "Guest" }],
    sections: [
      {
        title: "Intro",
        lines: [
          { speaker: "Host", text: "Welcome back." },
          { speaker: "Guest", text: "Glad to be here." },
          { speaker: "Host", text: "So what changed?" }
        ]
      }
    ]
  }
};

const scriptNow = () => useScriptStore.getState().getScript(SCRIPT_ID)!;
const linesNow = () => scriptNow().sections.flatMap((section) => section.lines);

beforeEach(() => {
  rpcRequest.mockReset();
  useScriptStore.setState({ scripts: {}, history: {} } as never);
  useScriptStore.getState().ensureScript(SCRIPT_ID);
  useGlobalChatStore.setState({
    selectedModel: {
      type: "language_model",
      id: "claude-sonnet-5",
      provider: "anthropic"
    }
  } as never);
});

describe("the script flow through its tools", () => {
  it("sets up, writes, binds one voice per speaker and voices each line once", async () => {
    const { unmount } = renderHook(() => useScriptAgentBridge(SCRIPT_ID));

    // Step 1 and 2, headlessly.
    await call("ui_script_set_setup", {
      stage: "format",
      brief: "Two people talk about a product that failed",
      format: "interview",
      length_seconds: 60
    });
    expect(scriptNow().setup).toMatchObject({
      stage: "format",
      format: "interview",
      length_seconds: 60
    });

    rpcRequest.mockResolvedValueOnce(writerAnswer);
    await call("ui_script_write", {});
    expect(scriptNow().cast.map((speaker) => speaker.name)).toEqual([
      "Host",
      "Guest"
    ]);
    expect(linesNow()).toHaveLength(3);
    // The writer plans; nothing is voiced yet (criterion 3).
    expect(linesNow().every((line) => line.takes.length === 0)).toBe(true);
    expect(scriptNow().setup?.stage).toBe("review");

    // Step 3: one voice per speaker, then voice everything.
    const [host, guest] = scriptNow().cast;
    await call("ui_script_set_speaker_voice", {
      speakerId: host.id,
      voice: RACHEL
    });
    await call("ui_script_set_speaker_voice", {
      speakerId: guest.id,
      voice: ADAM
    });
    expect(scriptNow().cast.map((speaker) => speaker.voice?.voice)).toEqual([
      "rachel",
      "adam"
    ]);

    rpcRequest.mockReset();
    rpcRequest.mockImplementation(async (command: string) =>
      command === "generate_media"
        ? { asset_ids: [`asset-${rpcRequest.mock.calls.length}`] }
        : { words: [] }
    );
    await call("ui_script_voice_all", {});

    const spoken = rpcRequest.mock.calls.filter(
      ([command]) => command === "generate_media"
    );
    expect(spoken).toHaveLength(3);
    expect(spoken.map(([, payload]) => payload.prompt)).toEqual([
      "Welcome back.",
      "Glad to be here.",
      "So what changed?"
    ]);
    // Each line was read in its own speaker's voice.
    expect(spoken.map(([, payload]) => payload.voice)).toEqual([
      "rachel",
      "adam",
      "rachel"
    ]);
    expect(linesNow().every((line) => line.takes.length === 1)).toBe(true);

    // A second pass has nothing left to voice: every line is up to date.
    const before = spoken.length;
    await call("ui_script_voice_all", {});
    expect(
      rpcRequest.mock.calls.filter(([command]) => command === "generate_media")
    ).toHaveLength(before);

    unmount();
  });

  it("records the lines it could not voice, and says the run finished (F8)", async () => {
    const { unmount } = renderHook(() => useScriptAgentBridge(SCRIPT_ID));
    await call("ui_script_set_setup", {
      stage: "voices",
      brief: "Two people talk about a product that failed",
      format: "interview"
    });
    rpcRequest.mockResolvedValueOnce(writerAnswer);
    await call("ui_script_write", {});
    const [host, guest] = scriptNow().cast;
    await call("ui_script_set_speaker_voice", {
      speakerId: host.id,
      voice: RACHEL
    });
    await call("ui_script_set_speaker_voice", {
      speakerId: guest.id,
      voice: ADAM
    });

    // The guest's line comes back with no audio; the host's two succeed.
    rpcRequest.mockReset();
    rpcRequest.mockImplementation(
      async (command: string, payload: Record<string, unknown>) => {
        if (command !== "generate_media") return { words: [] };
        if (payload.voice === "adam") throw new Error("that voice is offline");
        return { asset_ids: ["asset-1"] };
      }
    );
    await call("ui_script_voice_all", {});

    const run = readVoicingRun(scriptNow().setup);
    expect(run?.status).toBe("completed");
    expect(run?.total).toBe(3);
    expect(run?.voiced).toBe(2);
    expect(run?.failed).toHaveLength(1);
    expect(run?.failed[0].error).toBe("that voice is offline");
    unmount();
  });

  it("reports the setup a script carries so an agent can resume it", async () => {
    const { unmount } = renderHook(() => useScriptAgentBridge(SCRIPT_ID));
    await call("ui_script_set_setup", { stage: "voices", brief: "a podcast intro" });

    const state = (await call("ui_script_get_state", {})) as {
      setup: { stage: string; brief: string } | null;
    };
    expect(state.setup).toMatchObject({
      stage: "voices",
      brief: "a podcast intro"
    });
    unmount();
  });
});
