import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import {
  GenerateSvgLayerDialog,
  VectorLayerPanel
} from "../Inspector/VectorLayerPanel";
import { useSketchStore } from "../state";
import { formatSvgSource, getVectorSource } from "../vectorLayer";
import { rpcRequest } from "../../../lib/websocket/rpcRequest";

jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: jest.fn()
}));
jest.mock("../../properties/LanguageModelSelect", () => ({
  __esModule: true,
  default: () => null
}));

const mockRpc = rpcRequest as jest.MockedFunction<typeof rpcRequest>;

function Panel(): React.JSX.Element {
  const layer = useSketchStore((s) =>
    s.document.layers.find((l) => l.id === s.document.activeLayerId)
  );
  return (
    <ThemeProvider theme={mockTheme}>
      {layer && <VectorLayerPanel layer={layer} />}
    </ThemeProvider>
  );
}

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><text y="30">Original</text></svg>';
const activeSource = (): string =>
  getVectorSource(useSketchStore.getState().document.layers.at(-1)!);

beforeEach(() => {
  mockRpc.mockReset();
  act(() => {
    useSketchStore.getState().resetDocument();
    useSketchStore.getState().addVectorLayer("Title", svg);
  });
});

it("applies SVG edits, reports invalid markup, and follows undo", () => {
  render(<Panel />);
  const field = screen.getByRole("textbox", { name: "SVG source" });
  fireEvent.change(field, {
    target: { value: svg.replace("Original", "Edited") }
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply SVG" }));
  expect(activeSource()).toContain("Edited");
  act(() => {
    useSketchStore.getState().undo();
  });
  expect(field).toHaveValue(formatSvgSource(activeSource()));
  fireEvent.change(field, { target: { value: "broken" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply SVG" }));
  expect(screen.getByRole("alert")).toHaveTextContent("valid SVG");
  expect(activeSource()).toContain("Original");
});

it("applies with Ctrl+Enter and reverts unapplied edits", () => {
  render(<Panel />);
  const field = screen.getByRole("textbox", { name: "SVG source" });
  const saved = (field as HTMLTextAreaElement).value;
  fireEvent.change(field, { target: { value: svg.replace("Original", "Draft") } });
  fireEvent.click(screen.getByRole("button", { name: "Revert" }));
  expect(field).toHaveValue(saved);
  fireEvent.change(field, { target: { value: svg.replace("Original", "Keyed") } });
  fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
  expect(activeSource()).toContain("Keyed");
});

it("sends the prompt and current SVG to the model and applies the answer", async () => {
  mockRpc.mockResolvedValue({
    text: 'Here you go:\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><circle cx="50" cy="40" r="20" fill="orange"/></svg>\n```'
  });
  render(<Panel />);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Generate with AI" }),
    { target: { value: "Replace the text with an orange circle" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  await waitFor(() => expect(activeSource()).toContain("<circle"));
  const [command, payload] = mockRpc.mock.calls[0];
  expect(command).toBe("generate_text");
  expect(payload.prompt).toContain("Replace the text with an orange circle");
  expect(payload.prompt).toContain("Original");
  act(() => {
    useSketchStore.getState().undo();
  });
  expect(activeSource()).toContain("Original");
});

it("reports an answer without SVG and leaves the layer unchanged", async () => {
  mockRpc.mockResolvedValue({ text: "I cannot draw that." });
  render(<Panel />);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Generate with AI" }),
    { target: { value: "A cat" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "did not return an SVG"
  );
  expect(activeSource()).toContain("Original");
});

it("generates a new vector layer at the canvas size", async () => {
  mockRpc.mockResolvedValue({
    text: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>'
  });
  const onClose = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <GenerateSvgLayerDialog open onClose={onClose} />
    </ThemeProvider>
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Describe the new SVG layer" }),
    { target: { value: "A black square" } }
  );
  const before = useSketchStore.getState().document.layers.length;
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  await waitFor(() =>
    expect(useSketchStore.getState().document.layers).toHaveLength(before + 1)
  );
  const { canvas } = useSketchStore.getState().document;
  expect(mockRpc.mock.calls[0][1].prompt).toContain(
    `${canvas.width} × ${canvas.height}`
  );
  expect(useSketchStore.getState().document.layers.at(-1)).toMatchObject({
    name: "A black square",
    type: "vector"
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});
