import React from "react";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { appConfig } from "../config";
import { HeadingWidget, StepperWidget } from "../widgets";
import { makeTestRuntime } from "../../__tests__/testRuntime";

jest.mock("../useWidgetRuntime", () => ({
  // The stepper's write binding sits on "worlds"; a read binding has no value.
  useWidgetRuntime: ({ bindingMode }: { bindingMode: string }) => ({
    value: bindingMode === "write" ? "worlds" : undefined,
    setValue: jest.fn(),
    emit: jest.fn()
  })
}));

const slot = (text: string) => () => <span>{text}</span>;
const step = { binding: "var:dark", op: "eq", value: true };

// Puck injects `puck` and `id` at render time; the layout renders read neither.
type LayoutRender = (props: Record<string, unknown>) => React.ReactElement;
const renderOf = (type: "Container" | "Columns" | "Accordion") =>
  appConfig.components[type].render as unknown as LayoutRender;

it("hides a whole layout group until its visibleWhen condition holds", () => {
  const runtime = makeTestRuntime({ variables: { dark: false } });
  const Container = renderOf("Container");
  const Columns = renderOf("Columns");
  const Accordion = renderOf("Accordion");
  render(
    <ThemeProvider theme={mockTheme}>
      <runtime.wrapper>
        <Container id="c" visibleWhen={step} content={slot("panel child")} />
        <Columns id="g" visibleWhen={step} left={slot("left child")} right={slot("right child")} />
        <Accordion id="a" visibleWhen={step} title="More" content={slot("accordion child")} />
      </runtime.wrapper>
    </ThemeProvider>
  );
  expect(screen.queryByText("panel child")).toBeNull();
  expect(screen.queryByText("left child")).toBeNull();
  expect(screen.queryByText("More")).toBeNull();

  act(() => {
    runtime.store.getState().dispatchEvent({ type: "setVariable", variableId: "dark", value: true });
  });
  expect(screen.getByText("panel child")).toBeInTheDocument();
  expect(screen.getByText("right child")).toBeInTheDocument();
  expect(screen.getByText("More")).toBeInTheDocument();
});

it("marks the steps before the current one done unless the author says otherwise", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <StepperWidget
        id="steps"
        steps={[
          { value: "start", title: "Start" },
          { value: "anchor", title: "Anchor", completed: false },
          { value: "worlds", title: "Worlds" },
          { value: "ending", title: "Ending" }
        ]}
      />
    </ThemeProvider>
  );
  expect(screen.getByRole("button", { name: "✓ Start" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Anchor" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Worlds" })).toHaveAttribute("aria-current", "step");
  expect(screen.getByRole("button", { name: "Ending" })).toBeInTheDocument();
});

it("shows a heading's subtitle directly under it", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <HeadingWidget id="h" text="Worlds" level="2" subtitle="Four scenes around the anchor." />
    </ThemeProvider>
  );
  expect(screen.getByText("Worlds")).toBeInTheDocument();
  expect(screen.getByText("Four scenes around the anchor.")).toBeInTheDocument();
});
