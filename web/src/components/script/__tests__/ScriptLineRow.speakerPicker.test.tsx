import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ScriptLineRow from "../ScriptLineRow";
import {
  useScriptStore,
  type ScriptLine,
  type ScriptSpeaker
} from "../../../stores/script/ScriptStore";

const SCRIPT_ID = "script-1";

const kim: ScriptSpeaker = { id: "speaker_kim", name: "Kim" };
const lee: ScriptSpeaker = { id: "speaker_lee", name: "Lee" };

const line = (speakerId: string | null = "speaker_kim"): ScriptLine => ({
  id: "l1",
  speakerId,
  text: "We are closed.",
  takes: []
});

const seed = (cast: ScriptSpeaker[], speakerId: string | null = "speaker_kim") => {
  useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
  useScriptStore.getState().loadScript(SCRIPT_ID, {
    title: "T",
    cast,
    sections: [{ id: "s1", lines: [line(speakerId)] }],
    timelineId: null,
    storyboardId: null
  });
};

const renderRow = (
  props: Partial<ComponentProps<typeof ScriptLineRow>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptLineRow
        scriptId={SCRIPT_ID}
        line={line()}
        cast={[kim, lee]}
        highlighted={false}
        readOnly={false}
        {...props}
      />
    </ThemeProvider>
  );

const storedLine = () =>
  useScriptStore.getState().getScript(SCRIPT_ID)?.sections[0]?.lines[0];

describe("ScriptLineRow speaker picker", () => {
  beforeEach(() => {
    seed([kim, lee]);
  });

  it("assigns a speaker from the menu instead of cycling", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(
      screen.getByRole("button", { name: "Kim, change speaker" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Lee" }));

    expect(storedLine()?.speakerId).toBe("speaker_lee");
  });

  it("clears the speaker from the menu", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(
      screen.getByRole("button", { name: "Kim, change speaker" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "No speaker" }));

    expect(storedLine()?.speakerId).toBeNull();
  });

  it("adds a speaker and assigns it when the cast is empty", async () => {
    seed([], null);
    const user = userEvent.setup();
    renderRow({
      line: line(null),
      cast: []
    });

    await user.click(screen.getByRole("button", { name: "Assign speaker" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add speaker" }));

    const script = useScriptStore.getState().getScript(SCRIPT_ID);
    expect(script?.cast).toHaveLength(1);
    expect(storedLine()?.speakerId).toBe(script?.cast[0]?.id);
  });
});
