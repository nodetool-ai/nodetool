import { render, screen } from "@testing-library/react";
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
});
