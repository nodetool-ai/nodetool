import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { DRAG_DATA_MIME } from "../../../lib/dragdrop";
import type { ExampleGroup } from "../useExampleGroups";
import ExamplesPanel from "../ExamplesPanel";

const open = jest.fn();
const Icon = () => <span />;
const model = {
  slug: "chest",
  name: "Chest",
  file: "chest.glb",
  uri: "package://nodetool-base/game-models/dungeon/chest.glb",
  triangles: 120,
  clips: [],
  use: "Loot"
};
const groups: ExampleGroup[] = [
  {
    kind: "workflows",
    label: "Workflows",
    icon: Icon,
    entries: [
      { key: "workflows:w1", name: "Image Upscale", secondary: "4 nodes" }
    ],
    isLoading: false,
    isError: false,
    retry: jest.fn()
  },
  {
    kind: "models",
    label: "3D models",
    icon: Icon,
    dropHint: "Drag onto a 3D model input.",
    entries: [
      {
        key: "models:dungeon/chest",
        name: "Chest",
        secondary: "Dungeon · 120 triangles",
        drag: { type: "example-model", payload: model }
      }
    ],
    isLoading: false,
    isError: false,
    retry: jest.fn()
  },
  {
    kind: "games",
    label: "Games",
    icon: Icon,
    entries: [],
    isLoading: true,
    isError: false,
    retry: jest.fn()
  }
];

jest.mock("../useExampleGroups", () => ({
  useExampleGroups: () => ({ groups, openingKey: null, open })
}));

function showPanel(): void {
  render(
    <ThemeProvider theme={mockTheme}>
      <ExamplesPanel />
    </ThemeProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

it("lists every kind of example and opens one on click", async () => {
  showPanel();
  expect(
    screen.getByRole("region", { name: "Example Workflows" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "Example 3d models" })
  ).toBeInTheDocument();
  expect(screen.getByText("Loading games")).toBeInTheDocument();
  expect(screen.getByText("Drag onto a 3D model input.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Image Upscale/ }));
  expect(open).toHaveBeenCalledWith("workflows:w1");
});

it("narrows the list by type and by search", async () => {
  showPanel();
  const types = screen.getByRole("group", { name: "Example types" });
  await userEvent.click(
    within(types).getByRole("button", { name: "3D models" })
  );
  expect(screen.queryByText("Image Upscale")).not.toBeInTheDocument();
  expect(screen.getByText("Chest")).toBeInTheDocument();
  await userEvent.click(within(types).getByRole("button", { name: "All" }));
  await userEvent.type(screen.getByRole("textbox"), "upscale");
  expect(screen.getByText("Image Upscale")).toBeInTheDocument();
  expect(screen.queryByText("Chest")).not.toBeInTheDocument();
});

it("carries a draggable example's payload, and leaves other rows undraggable", () => {
  showPanel();
  const row = screen.getByRole("button", { name: /Chest/ });
  expect(row).toHaveAttribute("draggable", "true");
  expect(
    screen.getByRole("button", { name: /Image Upscale/ })
  ).not.toHaveAttribute("draggable", "true");
  const setData = jest.fn();
  fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: "" } });
  expect(setData).toHaveBeenCalledWith(
    DRAG_DATA_MIME,
    JSON.stringify({ type: "example-model", payload: model })
  );
});
