import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ScriptLineRow from "../ScriptLineRow";
import { useScriptStore } from "../../../stores/script/ScriptStore";

const SCRIPT_ID = "script-1";

/** The row as the pane renders it: re-read from the store on every edit. */
const LiveRow = () => {
  const line = useScriptStore(
    (state) => state.scripts[SCRIPT_ID]?.sections[0]?.lines[0]
  );
  if (!line) return null;
  return (
    <ScriptLineRow
      scriptId={SCRIPT_ID}
      line={line}
      cast={[]}
      highlighted={false}
      readOnly={false}
    />
  );
};

describe("ScriptLineRow direction", () => {
  beforeEach(() => {
    useScriptStore.setState({ scripts: {}, history: {}, saveStatus: {} });
    useScriptStore.getState().loadScript(SCRIPT_ID, {
      title: "T",
      cast: [],
      sections: [
        { id: "s1", lines: [{ id: "l1", text: "Hold.", direction: "warm", takes: [] }] }
      ],
      timelineId: null,
      storyboardId: null
    });
  });

  it("keeps a loaded direction's field open while it is cleared and retyped", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <LiveRow />
      </ThemeProvider>
    );

    const field = screen.getByRole("textbox", { name: "Direction" });
    await user.clear(field);
    await user.type(field, "angry");

    expect(screen.getByRole("textbox", { name: "Direction" })).toBe(field);
    expect(
      useScriptStore.getState().getScript(SCRIPT_ID)?.sections[0]?.lines[0]
        ?.direction
    ).toBe("angry");
  });
});
