import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ScriptLineRow from "../ScriptLineRow";
import {
  useScriptStore,
  type ScriptLine
} from "../../../stores/script/ScriptStore";

const SCRIPT_ID = "script-1";

const line = (): ScriptLine => ({
  id: "l1",
  text: "Hold.",
  takes: []
});

const renderRow = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptLineRow
        scriptId={SCRIPT_ID}
        line={line()}
        cast={[]}
        highlighted={false}
        readOnly={false}
      />
    </ThemeProvider>
  );

describe("ScriptLineRow pause after", () => {
  beforeEach(() => {
    useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
    useScriptStore.getState().loadScript(SCRIPT_ID, {
      title: "T",
      cast: [],
      sections: [{ id: "s1", lines: [line()] }],
      timelineId: null,
      storyboardId: null
    });
  });

  it("sets an authored pause from the line overflow menu", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole("button", { name: "More line actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "1s pause" }));

    expect(
      useScriptStore.getState().getScript(SCRIPT_ID)?.sections[0]?.lines[0]
        ?.pauseAfterMs
    ).toBe(1000);
  });
});
