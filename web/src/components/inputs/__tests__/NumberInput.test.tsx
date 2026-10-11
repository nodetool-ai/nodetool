import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NumberInput from "../NumberInput";

jest.mock("../numberInputStyles", () => ({
  numberInputStyles: () => ({})
}));
jest.mock("../../node/PropertyLabel", () => ({
  __esModule: true,
  default: ({ name }: { name: string }) => <div>{name}</div>
}));
jest.mock("../RangeIndicator", () => ({
  __esModule: true,
  default: () => <div data-testid="range-indicator" />
}));
jest.mock("../SpeedDisplay", () => ({
  __esModule: true,
  default: () => null
}));

describe("NumberInput", () => {
  it("renders +/- controls for integer inputs and applies increment/decrement", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const onChangeComplete = jest.fn();

    render(
      <NumberInput
        id="int-input"
        nodeId="node-1"
        name="Count"
        value={5}
        inputType="int"
        onChange={onChange}
        onChangeComplete={onChangeComplete}
      />
    );

    await user.click(screen.getByRole("button", { name: "Increase Count" }));
    await user.click(screen.getByRole("button", { name: "Decrease Count" }));

    expect(onChange).toHaveBeenNthCalledWith(1, null, 6);
    expect(onChangeComplete).toHaveBeenNthCalledWith(1, 6);
    expect(onChange).toHaveBeenNthCalledWith(2, null, 5);
    expect(onChangeComplete).toHaveBeenNthCalledWith(2, 5);
  });

  it("does not render +/- controls for float inputs", () => {
    render(
      <NumberInput
        id="float-input"
        nodeId="node-1"
        name="Ratio"
        value={0.5}
        inputType="float"
        onChange={jest.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Increase Ratio" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decrease Ratio" })).toBeNull();
  });

  describe("committing typed values", () => {
    const commit = (
      inputType: "int" | "float",
      value: number,
      typed: string
    ): jest.Mock => {
      const onChange = jest.fn();
      render(
        <NumberInput
          id="commit-input"
          nodeId="node-1"
          name="Limit"
          value={value}
          inputType={inputType}
          onChange={onChange}
        />
      );
      const input = screen.getByRole("textbox");
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: typed } });
      fireEvent.blur(input);
      return onChange;
    };

    it("keeps the previous integer when the field is cleared", () => {
      expect(commit("int", 7, "")).toHaveBeenLastCalledWith(null, 7);
    });

    it("rounds a pasted decimal into an integer field", () => {
      expect(commit("int", 7, "2.5")).toHaveBeenLastCalledWith(null, 3);
    });

    it("parses exponent notation in a float field", () => {
      expect(commit("float", 0.5, "1e-5")).toHaveBeenLastCalledWith(
        null,
        0.00001
      );
    });

    it("keeps a negative value when no bounds are declared", () => {
      expect(commit("int", 0, "-1")).toHaveBeenLastCalledWith(null, -1);
    });
  });

  it("does not commit when an idle field is right-clicked", () => {
    const onChange = jest.fn();
    const onChangeComplete = jest.fn();
    const { container } = render(
      <NumberInput
        id="ctx-input"
        nodeId="node-1"
        name="Limit"
        value={-1}
        min={0}
        max={10}
        inputType="int"
        onChange={onChange}
        onChangeComplete={onChangeComplete}
      />
    );

    const root = container.querySelector(".number-input");
    if (!root) {
      throw new Error("number input root not rendered");
    }
    fireEvent.contextMenu(root);

    expect(onChange).not.toHaveBeenCalled();
    expect(onChangeComplete).not.toHaveBeenCalled();
  });
});
