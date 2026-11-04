import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import TorchJSONProperty from "../TorchJSONProperty";

it("edits raw tensor arrays and retains invalid drafts without changing the graph", () => {
  const onChange = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <TorchJSONProperty
        property={{
          name: "shape",
          required: true,
          type: { type: "list", optional: false, type_args: [] },
          default: [1, 2]
        }}
        value={[1, 2]}
        onChange={onChange}
        nodeId="input"
        nodeType="nodetool.torch.Input"
        propertyIndex="0"
      />
    </ThemeProvider>
  );
  const field = screen.getByRole("textbox", { name: "shape" });
  fireEvent.change(field, { target: { value: "[2, 3]" } });
  expect(onChange).toHaveBeenLastCalledWith([2, 3]);
  onChange.mockClear();
  fireEvent.change(field, { target: { value: "[2," } });
  expect(screen.getByText("Enter a valid JSON array.")).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  expect(field).toHaveValue("[2,");
  fireEvent.change(field, { target: { value: "{}" } });
  expect(screen.getByText("Enter a JSON array.")).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
