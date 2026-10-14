import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import userEvent from "@testing-library/user-event";
import mockTheme from "../../../__mocks__/themeMock";
import GameToolbar from "../shell/GameToolbar";

const props = {
  name: "Neon Drift", playing: false, playSession: false, loading: false, saving: false,
  saveStatus: "saved", assistantOpen: false,
  sceneTreeOpen: true, inspectorOpen: true,
  playHref: "/game/game-1", onPlay: jest.fn(), onStop: jest.fn(), onStep: jest.fn(),
  onSave: jest.fn(), onLoad: jest.fn(), onPublish: jest.fn(), onAssistant: jest.fn(),
  onSceneTree: jest.fn(), onInspector: jest.fn()
};

it("opens the saved game in a separate browser tab", () => {
  const view = render(<ThemeProvider theme={mockTheme}><GameToolbar {...props} /></ThemeProvider>);
  const link = screen.getByRole("link", { name: "Play in new tab" });
  expect(link).toHaveAttribute("href", "/game/game-1");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");

  view.rerender(<ThemeProvider theme={mockTheme}><GameToolbar {...props} saveStatus="unsaved" /></ThemeProvider>);
  expect(screen.getByLabelText("Play in new tab")).toHaveAttribute("aria-disabled", "true");
});

it("toggles the scene tree and inspector panels", () => {
  render(<ThemeProvider theme={mockTheme}><GameToolbar {...props} /></ThemeProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Toggle scene tree" }));
  fireEvent.click(screen.getByRole("button", { name: "Toggle inspector" }));
  expect(props.onSceneTree).toHaveBeenCalledTimes(1);
  expect(props.onInspector).toHaveBeenCalledTimes(1);
});

it("reports a failed draft save instead of pending changes", () => {
  render(<ThemeProvider theme={mockTheme}><GameToolbar {...props} saveStatus="error" /></ThemeProvider>);
  expect(screen.getByText("Draft not saved")).toBeInTheDocument();
});

it("hides restart when the play host does not provide it", () => {
  render(<ThemeProvider theme={mockTheme}><GameToolbar {...props} playSession /></ThemeProvider>);
  expect(screen.queryByRole("button", { name: "Restart from tick 0" })).not.toBeInTheDocument();
});

it("restarts a running or paused play session from tick zero", async () => {
  const user = userEvent.setup();
  const onRestart = jest.fn();
  const view = render(<ThemeProvider theme={mockTheme}><GameToolbar {...props} playSession onRestart={onRestart} /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Restart from tick 0" }));
  view.rerender(<ThemeProvider theme={mockTheme}><GameToolbar {...props} playSession playing onRestart={onRestart} /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Restart from tick 0" }));
  expect(onRestart).toHaveBeenCalledTimes(2);
});

it.each([
  { playSession: false, loading: false },
  { playSession: true, loading: true }
])("disables restart without an available session: %j", (state) => {
  const onRestart = jest.fn();
  render(<ThemeProvider theme={mockTheme}><GameToolbar {...props} {...state} onRestart={onRestart} /></ThemeProvider>);
  const restart = screen.getByRole("button", { name: "Restart from tick 0" });
  expect(restart).toBeDisabled();
  expect(onRestart).not.toHaveBeenCalled();
});
