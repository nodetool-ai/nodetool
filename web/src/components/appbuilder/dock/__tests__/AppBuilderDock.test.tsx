import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { createDockLayoutStore } from "../../../../stores/dock/DockLayoutStore";
import { appBuilderDockLayoutModel } from "../../../../stores/appbuilder/AppBuilderDockLayout";

const mockStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const mockStore = createDockLayoutStore(appBuilderDockLayoutModel, { anonymous: true }, mockStorage);
jest.mock("../../../../stores/appbuilder/useAppBuilderDockLayoutStore", () => ({
  useAppBuilderDockLayoutStore: () => mockStore
}));

const mockBack = jest.fn();
const mockPuckState = {
  selectedItem: { type: "Heading", props: { id: "heading-1" } },
  config: { components: { Heading: { label: "Heading" } }, root: {} },
  history: { back: mockBack, forward: jest.fn(), hasPast: true, hasFuture: false }
};
jest.mock("@puckeditor/core", () => ({
  Puck: {
    Preview: () => <div>Puck preview</div>,
    Components: () => <div>Puck components</div>,
    Outline: () => <div>Puck outline</div>,
    Fields: () => <div>Puck fields</div>
  },
  createUsePuck: () => (select: (state: typeof mockPuckState) => unknown) => select(mockPuckState)
}));

import AppBuilderDock from "../AppBuilderDock";

const renderDock = (dataPanel?: React.ReactNode) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AppBuilderDock dataPanel={dataPanel} trailingActions={<button type="button">Save</button>} />
    </ThemeProvider>
  );

beforeEach(() => {
  act(() => mockStore.getState().selectLayout("Default"));
  jest.clearAllMocks();
});

it("lays Puck's editing surfaces out as dock panels", () => {
  renderDock(<div>App data fields</div>);
  expect(screen.getByText("Puck preview")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Components/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: /Outline/ })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Properties/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Puck components")).toBeVisible();
  expect(screen.getByText("Puck fields")).toBeVisible();
  // Properties names the selected component.
  expect(screen.getByRole("toolbar", { name: /Properties/ })).toHaveTextContent("Heading");
});

it("opens App Data as a tab beside Properties and closes it again", async () => {
  const user = userEvent.setup();
  renderDock(<div>App data fields</div>);
  expect(screen.queryByRole("tab", { name: /App data/ })).not.toBeInTheDocument();
  const toggle = screen.getByRole("button", { name: "App data" });
  expect(toggle).toHaveAttribute("aria-pressed", "false");

  await user.click(toggle);
  const tab = screen.getByRole("tab", { name: /App data/ });
  expect(tab).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("App data fields")).toBeVisible();
  expect(toggle).toHaveAttribute("aria-pressed", "true");

  await user.click(toggle);
  expect(screen.queryByRole("tab", { name: /App data/ })).not.toBeInTheDocument();
});

it("docks the agent under Properties when the surface supplies it", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <AppBuilderDock assistantPanel={<div>Agent thread</div>} />
    </ThemeProvider>
  );
  expect(screen.getByRole("tab", { name: /Agent/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Agent thread")).toBeVisible();
  expect(screen.getByRole("tab", { name: /Properties/ })).toHaveAttribute("aria-selected", "true");
});

it("leaves App Data out when the editor has no data panel", () => {
  renderDock();
  expect(screen.queryByRole("button", { name: "App data" })).not.toBeInTheDocument();
});

it("keeps the canvas open while side panels close", () => {
  renderDock();
  act(() => mockStore.getState().selectLayout("Canvas"));
  expect(screen.queryByRole("tab", { name: /Components/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /Properties/ })).not.toBeInTheDocument();
  const canvas = screen.getByRole("tab", { name: /Canvas/ });
  expect(within(canvas).queryByRole("button", { name: /Close/ })).not.toBeInTheDocument();
  expect(screen.getByText("Puck preview")).toBeVisible();
});

it("drives Puck's history from the toolbar", async () => {
  const user = userEvent.setup();
  renderDock();
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(mockBack).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
});

it("fills the host's document bar slots in place of its own toolbar", async () => {
  const user = userEvent.setup();
  const history = document.createElement("div");
  const view = document.createElement("div");
  const actions = document.createElement("div");
  document.body.append(history, view, actions);
  render(
    <ThemeProvider theme={mockTheme}>
      <AppBuilderDock
        dataPanel={<div>App data fields</div>}
        actions={<button type="button">Width</button>}
        trailingActions={<button type="button">Save</button>}
        barSlots={{ history, view, actions }}
      />
    </ThemeProvider>
  );

  await user.click(within(history).getByRole("button", { name: "Undo" }));
  expect(mockBack).toHaveBeenCalled();
  expect(within(view).getByRole("button", { name: "Width" })).toBeInTheDocument();
  expect(within(view).getByRole("button", { name: "App data" })).toBeInTheDocument();
  expect(within(actions).getByRole("button", { name: "Save" })).toBeInTheDocument();
  // The canvas stays in the dock.
  expect(screen.getByText("Puck preview")).toBeInTheDocument();
  history.remove();
  view.remove();
  actions.remove();
});
