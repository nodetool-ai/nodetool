import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { VectorLayerPanel } from "../Inspector/VectorLayerPanel";
import { useSketchStore } from "../state";
import { getVectorSource } from "../vectorLayer";

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

it("applies SVG edits, reports invalid markup, and follows undo", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><text y="30">Original</text></svg>';
  act(() => {
    useSketchStore.getState().resetDocument();
    useSketchStore.getState().addVectorLayer("Title", svg);
  });
  render(<Panel />);
  const field = screen.getByRole("textbox", { name: "SVG source" });
  fireEvent.change(field, {
    target: { value: svg.replace("Original", "Edited") }
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply SVG" }));
  expect(
    getVectorSource(useSketchStore.getState().document.layers.at(-1)!)
  ).toContain("Edited");
  act(() => {
    useSketchStore.getState().undo();
  });
  expect(field).toHaveValue(getVectorSource(useSketchStore.getState().document.layers.at(-1)!));
  fireEvent.change(field, { target: { value: "broken" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply SVG" }));
  expect(screen.getByRole("alert")).toHaveTextContent("valid SVG");
  expect(
    getVectorSource(useSketchStore.getState().document.layers.at(-1)!)
  ).toContain("Original");
});
