import { fireEvent, render, screen } from "@testing-library/react-native";
import { RENDERERS } from "../widgets";
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
jest.mock("../../../hooks/useResolvedMediaUri", () => ({
  useResolvedMediaUri: () => null,
  useResolvedMediaUris: (sources: string[]) =>
    sources.map(() => "https://example.com/resolved.png")
}));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() })
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockValue = undefined;
  mockOptions = undefined;
});
it("ChoiceCards renders asset-resolved images and rejects disabled presses", () => {
  const Widget = RENDERERS.ChoiceCards;
  const view = render(
    <Widget
      id="cards"
      disabled
      props={{
        options: [{ value: "a", title: "A", image: "asset://product" }]
      }}
    />
  );
  expect(
    view.UNSAFE_getByType(require("react-native").Image).props.source.uri
  ).toBe("https://example.com/resolved.png");
  fireEvent.press(screen.getByRole("radio"));
  expect(mockSetValue).not.toHaveBeenCalled();
});
it("Stepper initializes an empty binding but not a disabled binding", () => {
  const Widget = RENDERERS.Stepper;
  const view = render(
    <Widget
      id="steps"
      props={{ steps: [{ value: "inputs", title: "Inputs" }] }}
    />
  );
  expect(mockSetValue).toHaveBeenCalledWith("inputs");
  expect(screen.getByRole("button").props.accessibilityState.selected).toBe(
    false
  );
  view.unmount();
  mockSetValue.mockClear();
  render(
    <Widget
      id="steps"
      disabled
      props={{ steps: [{ value: "inputs", title: "Inputs" }] }}
    />
  );
  fireEvent.press(screen.getByRole("button"));
  expect(mockSetValue).not.toHaveBeenCalled();
});
it("Approval reflects selection and blocks disabled decisions", () => {
  mockValue = "approved";
  const Widget = RENDERERS.Approval;
  render(<Widget id="approval" disabled props={{}} />);
  expect(
    screen.getByRole("button", { name: "Approve" }).props.accessibilityState
  ).toMatchObject({ selected: true, disabled: true });
  fireEvent.press(screen.getByRole("button", { name: "Needs changes" }));
  expect(mockSetValue).not.toHaveBeenCalled();
});

it("ChoiceCards consumes reactive operation options and emits its selected value", () => {
  mockOptions = [{ value: "hero", title: "Product hero" }, { value: "locked", title: "Locked", disabled: true }];
  const Widget = RENDERERS.ChoiceCards;
  const props = { optionsBinding: "op:plan/out:directions", options: [{ value: "fallback" }] };
  const mounted = render(<Widget id="directions" props={props} />);
  fireEvent.press(screen.getByRole("radio", { name: "Product hero" }));
  expect(mockSetValue).toHaveBeenCalledWith("hero");
  expect(mockEmit).toHaveBeenCalledWith("change");
  mockSetValue.mockClear();
  fireEvent.press(screen.getByRole("radio", { name: "Locked" }));
  expect(mockSetValue).not.toHaveBeenCalled();
  mockOptions = [{ value: "detail", title: "Product detail" }];
  mounted.rerender(<Widget id="directions" props={props} />);
  expect(screen.queryByText("Product hero")).toBeNull();
  expect(screen.getByText("Product detail")).toBeTruthy();
});
it("ChoiceCards refuses malformed dynamic options without static fallback", () => {
  mockOptions = [{ value: "x" }, { value: "x" }];
  const Widget = RENDERERS.ChoiceCards;
  render(<Widget id="directions" props={{ optionsBinding: "op:plan/out:directions", options: [{ value: "fallback" }] }} />);
  expect(screen.queryByRole("radio")).toBeNull();
});
