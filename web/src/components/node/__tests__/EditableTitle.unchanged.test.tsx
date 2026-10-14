import { screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import EditableTitle from "../EditableTitle";
import { makeNodeStore, nodeStoreRenderers } from "../../../test-utils/nodeStore";

const updateNodeData = jest.fn();
const { render } = nodeStoreRenderers(makeNodeStore({ updateNodeData }));

const renderTitle = (title: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <EditableTitle nodeId="n1" title={title} />
    </ThemeProvider>
  );

describe("EditableTitle", () => {
  beforeEach(() => {
    updateNodeData.mockClear();
  });

  test("leaving a note unchanged writes nothing", () => {
    renderTitle("Hello");
    fireEvent.doubleClick(screen.getByText("Hello"));
    const textarea = screen.getByLabelText("Note text");

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(updateNodeData).not.toHaveBeenCalled();
  });

  test("blurring an unchanged note writes nothing", () => {
    renderTitle("Hello");
    fireEvent.doubleClick(screen.getByText("Hello"));
    fireEvent.blur(screen.getByLabelText("Note text"));

    expect(updateNodeData).not.toHaveBeenCalled();
  });

  test("a changed note is written", () => {
    renderTitle("Hello");
    fireEvent.doubleClick(screen.getByText("Hello"));
    const textarea = screen.getByLabelText("Note text");
    fireEvent.change(textarea, { target: { value: "Bye" } });
    fireEvent.blur(textarea);

    expect(updateNodeData).toHaveBeenCalledWith("n1", { title: "Bye" });
  });
});
