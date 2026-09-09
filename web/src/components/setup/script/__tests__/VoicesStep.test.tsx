/**
 * The voices step: a dropdown-selected voice plays the speaker's own first
 * line, each speaker selects independently, and samples stay explicit calls.
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
        modelLabel: "Eleven v3",
        provider: "elevenlabs",
        model: "eleven_v3",
        voice: "rachel"
      },
      {
        id: "elevenlabs:eleven_v3:adam",
        label: "Adam",
        modelLabel: "Eleven v3",
        provider: "elevenlabs",
        model: "eleven_v3",
        voice: "adam"
      },
      {
        id: "openai:gpt-4o-mini-tts:alloy",
        label: "Alloy",
        modelLabel: "GPT-4o mini TTS",
        provider: "openai",
        model: "gpt-4o-mini-tts",
        voice: "alloy"
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
  setSpeakerVoice.mockImplementation((speakerId, voice) => {
    useScriptStore.getState().updateSpeaker(SCRIPT_ID, speakerId, { voice });
  });
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
  it("gives every speaker a TTS model and voice dropdown", () => {
    renderStep();
    expect(
      screen.getByRole("combobox", { name: "TTS model for Host" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Voice for Host" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "TTS model for Guest" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Voice for Guest" })
    ).toBeInTheDocument();
  });

  it("plays the speaker's own first line in the selected voice, once", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(
      screen.getByRole("combobox", { name: "TTS model for Host" })
    );
    await user.click(
      screen.getByRole("option", { name: "Eleven v3 (elevenlabs)" })
    );
    await user.click(
      screen.getByRole("button", { name: "Hear Rachel for Host" })
    );

    expect(rpcRequest).toHaveBeenCalledTimes(1);
    expect(rpcRequest).toHaveBeenCalledWith("generate_media", {
      mode: "audio",
      provider: "elevenlabs",
      model: "eleven_v3",
      voice: "rachel",
      prompt: HOST_LINE
    });

    // The sample arrived as a player, and no second call was made for it.
    expect(await screen.findByLabelText("Rachel sample")).toBeInTheDocument();
    expect(rpcRequest).toHaveBeenCalledTimes(1);
  });

  it("samples the guest's line for the guest's row, not the host's", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(
      screen.getByRole("combobox", { name: "TTS model for Guest" })
    );
    await user.click(
      screen.getByRole("option", { name: "Eleven v3 (elevenlabs)" })
    );
    await user.click(
      screen.getByRole("button", { name: "Hear Rachel for Guest" })
    );

    expect(rpcRequest.mock.calls[0][1]).toMatchObject({ prompt: GUEST_LINE });
  });

  it("binds the picked voice to that speaker alone", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(
      screen.getByRole("combobox", { name: "TTS model for Guest" })
    );
    await user.click(
      screen.getByRole("option", { name: "Eleven v3 (elevenlabs)" })
    );
    await user.click(screen.getByRole("combobox", { name: "Voice for Guest" }));
    await user.click(screen.getByRole("option", { name: "Adam" }));

    expect(setSpeakerVoice).toHaveBeenCalledTimes(2);
    expect(setSpeakerVoice).toHaveBeenCalledWith("spk_guest", {
      provider: "elevenlabs",
      model: "eleven_v3",
      voice: "adam"
    });
  });

  it("changes the model before offering that model's voices", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(
      screen.getByRole("combobox", { name: "TTS model for Host" })
    );
    await user.click(
      screen.getByRole("option", { name: "GPT-4o mini TTS (openai)" })
    );

    expect(setSpeakerVoice).toHaveBeenCalledWith("spk_host", {
      provider: "openai",
      model: "gpt-4o-mini-tts",
      voice: "alloy"
    });
    expect(
      screen.getByRole("combobox", { name: "Voice for Host" })
    ).toHaveTextContent("Alloy");
  });

  it("writes the pace every speaker is read at, and sends it (F12)", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("combobox", { name: "Pace" }));
    await user.click(screen.getByRole("option", { name: "Fast" }));

    expect(useScriptStore.getState().scripts[SCRIPT_ID].setup?.pace).toBe(
      "fast"
    );

    await user.click(
      screen.getByRole("combobox", { name: "TTS model for Host" })
    );
    await user.click(
      screen.getByRole("option", { name: "Eleven v3 (elevenlabs)" })
    );
    await user.click(
      screen.getByRole("button", { name: "Hear Rachel for Host" })
    );

    expect(rpcRequest.mock.calls[0][1]).toMatchObject({ speed: 1.15 });
  });

  it("finds the sample of a line longer than the sample cap (F13)", async () => {
    const user = userEvent.setup();
    const long = `  ${"word ".repeat(80)}  `;
    useScriptStore.getState().patchLine(SCRIPT_ID, "line_1", { text: long });
    renderStep();

    await user.click(
      screen.getByRole("combobox", { name: "TTS model for Host" })
    );
    await user.click(
      screen.getByRole("option", { name: "Eleven v3 (elevenlabs)" })
    );
    await user.click(
      screen.getByRole("button", { name: "Hear Rachel for Host" })
    );

    // The lookup keys the same normalized words the call sent, so the player
    // appears without asking for the sample again.
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

    expect(
      screen.queryByRole("button", { name: /Hear .* for Extra/ })
    ).not.toBeInTheDocument();
  });
});
