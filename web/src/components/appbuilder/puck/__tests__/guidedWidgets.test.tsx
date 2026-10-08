import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { ChoiceCardsWidget, StepperWidget, ApprovalWidget } from "../widgets";

const mockSetValue = jest.fn();
const mockEmit = jest.fn();
let mockValue: unknown;
let mockOptions: unknown;
jest.mock("../useWidgetRuntime", () => ({
  useWidgetRuntime: ({ bindingMode }: { bindingMode: string }) => ({
    value: bindingMode === "read" ? mockOptions : mockValue,
    setValue: mockSetValue,
    emit: mockEmit
  })
}));
jest.mock("../../../ui_primitives/ResponsiveImage", () => ({
  __esModule: true,
  ResponsiveImage: ({ locator }: { locator: string }) => (
    <span data-testid="choice-image">{locator}</span>
  )
}));
const view = (child: React.ReactNode) =>
  render(<ThemeProvider theme={mockTheme}>{child}</ThemeProvider>);
beforeEach(() => {
  jest.clearAllMocks();
  mockValue = undefined;
  mockOptions = undefined;
});
it("disabled ChoiceCards reject pointer and keyboard edits and leave tab order", () => {
  view(
    <ChoiceCardsWidget
      id="choices"
      disabled
      options={[{ value: "a", title: "A" }]}
    />
  );
  const radio = screen.getByRole("radio");
  expect(radio).toHaveAttribute("aria-disabled", "true");
  expect(radio).toHaveAttribute("tabindex", "-1");
  fireEvent.click(radio);
  fireEvent.keyDown(radio, { key: "Enter" });
  fireEvent.keyDown(radio, { key: " " });
  expect(mockSetValue).not.toHaveBeenCalled();
});
it("Stepper initializes binding and never marks an unknown bound step current", () => {
  view(
    <StepperWidget id="steps" steps={[{ value: "inputs", title: "Inputs" }]} />
  );
  expect(mockSetValue).toHaveBeenCalledWith("inputs");
  expect(screen.getByRole("button")).not.toHaveAttribute("aria-current");
});
it("disabled Stepper does not initialize or activate", () => {
  view(
    <StepperWidget
      id="steps"
      disabled
      steps={[{ value: "inputs", title: "Inputs" }]}
    />
  );
  const button = screen.getByRole("button");
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(mockSetValue).not.toHaveBeenCalled();
});
it("Stepper goes back to a done step and blocks it when back is not allowed", () => {
  mockValue = "review";
  const steps = [
    { value: "inputs", title: "Inputs" },
    { value: "review", title: "Review" }
  ];
  const { rerender } = view(<StepperWidget id="steps" steps={steps} />);
  fireEvent.click(screen.getByRole("button", { name: "Step 1 of 2: Inputs, done" }));
  expect(mockSetValue).toHaveBeenCalledWith("inputs");
  expect(mockEmit).toHaveBeenCalledWith("change");

  mockSetValue.mockClear();
  rerender(
    <ThemeProvider theme={mockTheme}>
      <StepperWidget id="steps" steps={steps} allowBack={false} />
    </ThemeProvider>
  );
  expect(screen.getByRole("button", { name: "Step 1 of 2: Inputs, done" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Step 2 of 2: Review" })).toHaveAttribute(
    "aria-current",
    "step"
  );
});
it("Approval exposes the selected decision and rejects disabled edits", () => {
  mockValue = "approved";
  view(<ApprovalWidget id="approval" disabled />);
  expect(screen.getByRole("button", { name: "Approve" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  fireEvent.click(screen.getByRole("button", { name: "Needs changes" }));
  expect(mockSetValue).not.toHaveBeenCalled();
});

it("passes ChoiceCards asset identifiers through the media rendering boundary", () => {
  view(
    <ChoiceCardsWidget
      id="cards"
      options={[{ value: "a", image: "asset://product" }]}
    />
  );
  expect(screen.getByTestId("choice-image")).toHaveTextContent(
    "asset://product"
  );
});


it("renders reactive operation output choices and writes the selected value", () => {
  mockOptions = [{ value: "hero", title: "Product hero", image: "asset://hero" }];
  const props = { id: "directions", optionsBinding: "op:plan/out:directions", binding: "var:direction" };
  const mounted = view(<ChoiceCardsWidget {...props} />);
  fireEvent.keyDown(screen.getByRole("radio", { name: "Product hero" }), { key: "Enter" });
  expect(mockSetValue).toHaveBeenCalledWith("hero");
  expect(mockEmit).toHaveBeenCalledWith("change");
  mockOptions = [{ value: "detail", title: "Product detail" }];
  mounted.rerender(<ThemeProvider theme={mockTheme}><ChoiceCardsWidget {...props} /></ThemeProvider>);
  expect(screen.queryByText("Product hero")).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Product detail" })).toBeInTheDocument();
});

it("does not substitute static choices for missing or malformed bound output", () => {
  mockOptions = [{ value: "same", title: "First" }, { value: "same", title: "Second" }];
  view(<ChoiceCardsWidget id="directions" optionsBinding="op:plan/out:directions" options={[{ value: "fallback" }]} />);
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});
