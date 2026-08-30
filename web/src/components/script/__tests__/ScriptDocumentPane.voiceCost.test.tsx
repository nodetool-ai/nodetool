/**
 * The *Voice all* button carries what the click will spend. Speech is billed
 * by the characters synthesized, so the figure has to come off the script's own
 * unvoiced lines — and a script with nothing left to voice, or a voice the
 * catalog cannot price, must show the plain label rather than "$0".
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import {
  useScriptStore,
  type ScriptTake,
  type VoiceBinding
} from "../../../stores/script/ScriptStore";

jest.mock("../../../trpc/client", () => ({
  trpc: {
    storyboards: { get: { useQuery: jest.fn(() => ({ data: undefined })) } }
  },
  trpcClient: {}
}));

jest.mock("../StoryboardLinkControl", () => ({
  __esModule: true,
  default: () => null
}));

const mockPrice = jest.fn();
jest.mock("../../../utils/modelUnitPricing", () => ({
  getModelUnitPrice: (...args: unknown[]) => mockPrice(...args)
}));

import ScriptDocumentPane from "../ScriptDocumentPane";

const SCRIPT_ID = "script-voice-cost";
const VOICE: VoiceBinding = {
  provider: "elevenlabs",
  model: "eleven_v3",
  voice: "alloy"
};

const matchingTake = (): ScriptTake => ({
  id: "take-a",
  assetId: "voice-a",
  durationMs: 2000,
  words: [],
  textSnapshot: "Hello there.",
  voiceSnapshot: VOICE,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const seed = (takes: ScriptTake[]): void => {
  useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
  useScriptStore.getState().loadScript(SCRIPT_ID, {
    title: "My script",
    cast: [{ id: "sp-1", name: "Mara", voice: VOICE }],
    sections: [
      {
        id: "s1",
        lines: [
          {
            id: "line-a",
            speakerId: "sp-1",
            // 12 characters.
            text: "Hello there.",
            takes,
            currentTakeId: takes[0]?.id ?? null
          }
        ]
      }
    ],
    timelineId: null,
    storyboardId: null
  });
};

const renderPane = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptDocumentPane scriptId={SCRIPT_ID} readOnly={false} />
    </ThemeProvider>
  );

describe("ScriptDocumentPane voice cost", () => {
  beforeEach(() => {
    mockPrice.mockReset();
  });

  it("puts the click's price on Voice all", () => {
    mockPrice.mockReturnValue({
      unit_price: 0.0012,
      billing_unit: "1m_chars",
      currency: "USD",
      source: "bundle",
      breakdown: "12 chars × $100/1M chars"
    });
    seed([]);
    renderPane();

    expect(mockPrice).toHaveBeenCalledWith(
      { id: "eleven_v3", provider: "elevenlabs" },
      { characters: 12 }
    );
    expect(
      screen.getByRole("button", { name: /Voice all · ~\$0\.0012/ })
    ).toBeInTheDocument();
  });

  it("shows the plain label when every line is already voiced", () => {
    seed([matchingTake()]);
    renderPane();

    expect(mockPrice).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Voice all" })
    ).toBeInTheDocument();
  });

  it("shows the plain label rather than $0 when the model declines", () => {
    mockPrice.mockReturnValue({
      unit_price: 0,
      billing_unit: "1m_tokens",
      currency: "USD",
      source: "bundle",
      declined: "priced per token of generated audio"
    });
    seed([]);
    renderPane();

    expect(
      screen.getByRole("button", { name: "Voice all" })
    ).toBeInTheDocument();
  });
});
