import { fireEvent, render, screen } from "@testing-library/react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import GameScriptPane from "../GameScriptPane";

jest.mock("@nodetool-ai/game-runtime", () => ({ GAME_SCRIPT_TYPES: "", GAME_SCRIPT_TYPES_3D: "" }));
jest.mock("../../../hooks/editor/useMonacoEditor", () => ({
  useMonacoEditor: () => ({
    MonacoEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
      <textarea aria-label="Script source" value={value} onChange={(event) => onChange(event.target.value)} />,
    loadMonacoIfNeeded: mockLoadMonaco
  })
}));
const mockLoadMonaco = jest.fn();

it("makes unsaved conflict edits explicit and lets the author keep their latest text", () => {
  const onChange = jest.fn();
  const pane = (source: string) => <ThemeProvider theme={createTheme({ cssVariables: true })}><GameScriptPane
    entityId="ship" entityName="Ship" behaviorIndex={0}
    behavior={{ kind: "script", source, maxCommands: 16, maxTickMs: 8 }}
    onChange={onChange} onClose={jest.fn()} /></ThemeProvider>;
  const view = render(pane("original"));
  fireEvent.change(screen.getByLabelText("Script source"), { target: { value: "local" } });
  view.rerender(pane("remote"));
  expect(screen.getByRole("alert")).toHaveTextContent("Your edits are not being saved");
  onChange.mockClear();
  fireEvent.change(screen.getByLabelText("Script source"), { target: { value: "latest local" } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep my version" }));
  expect(onChange).toHaveBeenCalledWith("latest local");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Script source"), { target: { value: "continued" } });
  expect(onChange).toHaveBeenLastCalledWith("continued");
});

it("can discard local text for the latest draft without writing it back", () => {
  const onChange = jest.fn();
  const pane = (source: string) => <ThemeProvider theme={createTheme({ cssVariables: true })}><GameScriptPane
    entityId="ship" entityName="Ship" behaviorIndex={0}
    behavior={{ kind: "script", source, maxCommands: 16, maxTickMs: 8 }}
    onChange={onChange} onClose={jest.fn()} /></ThemeProvider>;
  const view = render(pane("original"));
  fireEvent.change(screen.getByLabelText("Script source"), { target: { value: "local" } });
  view.rerender(pane("remote"));
  onChange.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Use draft version" }));
  expect(screen.getByLabelText("Script source")).toHaveValue("remote");
  expect(onChange).not.toHaveBeenCalled();
});
