/**
 * The voices step (PRD § 9.3, criterion 5, first half): a tile plays the
 * speaker's *own* first line in that voice, and it does so with one TTS call
 * per tile rather than one per render. Picking a tile binds the voice through
 * the same handler `ui_script_set_speaker_voice` calls.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

const rpcRequest = jest.fn();
jest.mock("../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-test"
}));

jest.mock("../../../../hooks/useResolvedMediaUri");

// The workspace voice list is a tRPC query this suite does not stand up.
jest.mock("../useSetupVoices", () => ({
  useSetupVoices: () => ({
    voices: [
      {
        id: "elevenlabs:eleven_v3:rachel",
        label: "Rachel",
        provider: "elevenlabs",
        model: "eleven_v3",
        voice: "rachel"
      },
      {
        id: "elevenlabs:eleven_v3:adam",
        label: "Adam",
        provider: "elevenlabs",
        model: "eleven_v3",
        voice: "adam"
      }
    ],
    loading: false,
    error: null,
    retry: jest.fn(),
    noProvider: false
  })
}));

import {
  setScriptAgentHandler,
  type ScriptAgentHandler
} from "../../../../components/script/scriptAgentBridge";
import { resetVoiceSamples } from "../../../../hooks/script/useVoiceSamples";
import { useScriptStore } from "../../../../stores/script/ScriptStore";
import { VoicesStep } from "../VoicesStep";

const SCRIPT_ID = "s-voices";
const HOST_LINE = "Welcome back to the show.";
const GUEST_LINE = "Glad to be here.";

const setSpeakerVoice = jest.fn();

const seed = (): void => {
  const store = useScriptStore.getState();
  store.ensureScript(SCRIPT_ID);
  store.setSetup(SCRIPT_ID, { stage: "voices", brief: "an interview" });
  store.applyWrittenScript(SCRIPT_ID, {
    cast: [
      { id: "spk_host", name: "Host" },
      { id: "spk_guest", name: "Guest" }
    ],
    sections: [
      {
        id: "sec_1",
        title: "Intro",
        lines: [
          { id: "line_1", speakerId: "spk_host", text: HOST_LINE },
          { id: "line_2", speakerId: "spk_guest", text: GUEST_LINE },
          { id: "line_3", speakerId: "spk_host", text: "So what changed?" }
        ]
      }
    ]
  });
};

const renderStep = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <VoicesStep scriptId={SCRIPT_ID} />
    </ThemeProvider>
  );

beforeEach(() => {
  rpcRequest.mockReset();
  rpcRequest.mockResolvedValue({ asset_ids: ["asset-1"] });
  setSpeakerVoice.mockClear();
  resetVoiceSamples();
  useScriptStore.setState({ scripts: {}, history: {} } as never);
  seed();
  setScriptAgentHandler(SCRIPT_ID, {
    setSpeakerVoice
  } as unknown as ScriptAgentHandler);
});

afterEach(() => {
  setScriptAgentHandler(SCRIPT_ID, null);
});

describe("VoicesStep", () => {
  // The voices are a mutually exclusive choice, so each row is a radio group
  // with one tab stop, not a bag of buttons (F26).
  it("gives every speaker in the cast its own row of voices", () => {
    renderStep();
    expect(screen.getByRole("radiogroup", { name: "Voices for Host" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Voices for Guest" })).toBeInTheDocument();
  });

  it("plays the speaker's own first line in the tile's voice, once", async () => {
    const user = userEvent.setup();
    renderStep();

    const hostRow = screen.getByRole("radiogroup", { name: "Voices for Host" });
    const [rachel] = Array.from(
      hostRow.querySelectorAll("button")
    ).filter((button) => button.textContent === "Hear Rachel");
    await user.click(rachel);

    expect(rpcRequest).toHaveBeenCalledTimes(1);
    expect(rpcRequest).toHaveBeenCalledWith("generate_media", {
      mode: "audio",
      provider: "elevenlabs",
      model: "eleven_v3",
      voice: "rachel",
      prompt: HOST_LINE
    });

    // The sample arrived, so the tile is now a player rather than a button —
    // and no second call was made for it.
    expect(
      await screen.findByLabelText("Rachel sample")
    ).toBeInTheDocument();
    expect(rpcRequest).toHaveBeenCalledTimes(1);
  });

  it("samples the guest's line for the guest's row, not the host's", async () => {
    const user = userEvent.setup();
    renderStep();

    const guestRow = screen.getByRole("radiogroup", { name: "Voices for Guest" });
    const [firstTile] = Array.from(
      guestRow.querySelectorAll("button")
    ).filter((button) => button.textContent === "Hear Rachel");
    await user.click(firstTile);

    expect(rpcRequest.mock.calls[0][1]).toMatchObject({ prompt: GUEST_LINE });
  });

  it("binds the picked voice to that speaker alone", async () => {
    const user = userEvent.setup();
    renderStep();

    const guestRow = screen.getByRole("radiogroup", { name: "Voices for Guest" });
    await user.click(screen.getAllByRole("radio", { name: "Adam" })[1]);

    expect(setSpeakerVoice).toHaveBeenCalledTimes(1);
    expect(setSpeakerVoice).toHaveBeenCalledWith("spk_guest", {
      provider: "elevenlabs",
      model: "eleven_v3",
      voice: "adam"
    });
    expect(guestRow).toBeInTheDocument();
  });

  it("writes the pace every speaker is read at, and sends it (F12)", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("combobox", { name: "Pace" }));
    await user.click(screen.getByRole("option", { name: "Fast" }));

    expect(useScriptStore.getState().scripts[SCRIPT_ID].setup?.pace).toBe("fast");

    const hostRow = screen.getByRole("radiogroup", { name: "Voices for Host" });
    const [rachel] = Array.from(hostRow.querySelectorAll("button")).filter(
      (button) => button.textContent === "Hear Rachel"
    );
    await user.click(rachel);

    expect(rpcRequest.mock.calls[0][1]).toMatchObject({ speed: 1.15 });
  });

  it("finds the sample of a line longer than the sample cap (F13)", async () => {
    const user = userEvent.setup();
    const long = `  ${"word ".repeat(80)}  `;
    useScriptStore.getState().patchLine(SCRIPT_ID, "line_1", { text: long });
    renderStep();

    const hostRow = screen.getByRole("radiogroup", { name: "Voices for Host" });
    const [rachel] = Array.from(hostRow.querySelectorAll("button")).filter(
      (button) => button.textContent === "Hear Rachel"
    );
    await user.click(rachel);

    // The lookup keys the same normalized words the call sent, so the tile
    // becomes a player instead of asking for the sample again.
    expect(await screen.findByLabelText("Rachel sample")).toBeInTheDocument();
    expect(rpcRequest).toHaveBeenCalledTimes(1);
  });

  it("says an audition is a speech call before one is pressed (F23)", () => {
    renderStep();
    expect(
      screen.getAllByText(/Each sample is one speech call/).length
    ).toBeGreaterThan(0);
  });

  it("offers no audition for a speaker with no lines (F13)", () => {
    useScriptStore
      .getState()
      .addSpeaker(SCRIPT_ID, { id: "spk_extra", name: "Extra", voice: null });
    renderStep();

    const row = screen.getByRole("radiogroup", { name: "Voices for Extra" });
    expect(
      Array.from(row.querySelectorAll("button")).filter((button) =>
        button.textContent?.startsWith("Hear ")
      )
    ).toHaveLength(0);
  });
});
