/**
 * The review step (PRD § 9.2, D4): the script as the editor shows it, editable
 * in place, and nothing spent. Every edit goes through the same handler the
 * `ui_script_set_line_text` and `ui_script_set_speaker` tools call, which is
 * what keeps the two paths from drifting (criterion 6).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

import {
  setScriptAgentHandler,
  type ScriptAgentHandler
} from "../../../../components/script/scriptAgentBridge";
import { useScriptStore } from "../../../../stores/script/ScriptStore";
import { ReviewStep } from "../ReviewStep";

const SCRIPT_ID = "s-review";
const setLineText = jest.fn();
const setLineSpeaker = jest.fn();

const seed = (): void => {
  const store = useScriptStore.getState();
  store.ensureScript(SCRIPT_ID);
  store.setSetup(SCRIPT_ID, { stage: "review", brief: "an interview", pace: "slow" });
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
          {
            id: "line_1",
            speakerId: "spk_host",
            text: "Welcome back.",
            direction: "warm"
          },
          {
            id: "line_2",
            speakerId: "spk_guest",
            text: "Glad to be here.",
            targetDurationMs: 2750
          }
        ]
      }
    ]
  });
};

const renderStep = (onRewrite = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ReviewStep scriptId={SCRIPT_ID} onRewrite={onRewrite} />
    </ThemeProvider>
  );

beforeEach(() => {
  setLineText.mockClear();
  setLineSpeaker.mockClear();
  useScriptStore.setState({ scripts: {}, history: {} } as never);
  seed();
  setScriptAgentHandler(SCRIPT_ID, {
    setLineText,
    setLineSpeaker
  } as unknown as ScriptAgentHandler);
});

afterEach(() => {
  setScriptAgentHandler(SCRIPT_ID, null);
});

describe("script ReviewStep", () => {
  it("shows each line's speaker, words and direction", () => {
    renderStep();
    expect(screen.getByDisplayValue("Welcome back.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Glad to be here.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("warm")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: "Speaker" })).toHaveLength(2);
  });

  it("shows the timing a subtitle import brought with it", () => {
    renderStep();
    expect(screen.getByDisplayValue("2.8s")).toBeInTheDocument();
  });

  it("counts the words and states the spoken length at the flow's pace", () => {
    // Six words at the slow rate of 110 wpm is a little over three seconds.
    renderStep();
    expect(
      screen.getByText("6 words · about 3s spoken at a slow read")
    ).toBeInTheDocument();
  });

  it("writes a text edit through the line-text tool's handler", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.type(screen.getByDisplayValue("Welcome back."), "!");

    expect(setLineText).toHaveBeenCalledWith("line_1", "Welcome back.!");
  });

  it("writes a speaker change through the speaker tool's handler", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getAllByRole("combobox", { name: "Speaker" })[0]);
    await user.click(screen.getByRole("option", { name: "Guest" }));

    expect(setLineSpeaker).toHaveBeenCalledWith("line_1", "spk_guest");
  });

  it("offers a rewrite and spends nothing on its own", async () => {
    const user = userEvent.setup();
    const onRewrite = jest.fn();
    renderStep(onRewrite);

    await user.click(screen.getByRole("button", { name: "Rewrite" }));

    expect(onRewrite).toHaveBeenCalledTimes(1);
    expect(
      useScriptStore
        .getState()
        .scripts[SCRIPT_ID].sections.flatMap((section) => section.lines)
        .every((line) => line.takes.length === 0)
    ).toBe(true);
  });
});
