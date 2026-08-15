/**
 * The widgets added beyond the original catalog: the display forms that shape a
 * bound value (Alert, List, Key/Value, Stat, Download), the multi-option
 * inputs, and the layout widgets that hold slots.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime, INPUT_KEY, OUTPUT_KEY } from "../../__tests__/testRuntime";
import {
  AccordionWidget,
  AlertWidget,
  CheckboxGroupWidget,
  DownloadWidget,
  KeyValueWidget,
  ListWidget,
  RadioGroupWidget,
  StatWidget,
  TabsWidget
} from "../widgets";

// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock (resolution itself is covered
// by hooks/__tests__/useResolvedMediaUri.test.tsx).
jest.mock("../../../../hooks/useResolvedMediaUri");

const renderWidget = (
  element: React.ReactElement,
  initial: Partial<AppInstanceState> = {}
) => {
  const runtime = makeTestRuntime(initial);
  const { wrapper: Wrapper } = runtime;
  return {
    ...runtime,
    ...render(
      <ThemeProvider theme={mockTheme}>
        <Wrapper>{element}</Wrapper>
      </ThemeProvider>
    )
  };
};

const withOutput = (value: unknown): Partial<AppInstanceState> => ({
  outputs: {
    [OUTPUT_KEY]: { value, invocationId: "j1", status: "done", revision: 1 }
  }
});

const OPTIONS = [{ value: "Red" }, { value: "Blue" }];

/** The runtime stores an input as a cell; tests care about the value in it. */
const inputValue = (state: AppInstanceState): unknown =>
  state.inputs[INPUT_KEY]?.value;

const withInput = (value: unknown): Partial<AppInstanceState> => ({
  inputs: { [INPUT_KEY]: { value, dirty: true, revision: 1 } }
});

/** A slot, as Puck hands one to a layout widget's render function. */
const slot = (text: string) => () => <div>{text}</div>;

describe("AlertWidget", () => {
  it("renders the bound value as the message", () => {
    renderWidget(
      <AlertWidget id="a1" binding="result" severity="error" title="Failed" />,
      withOutput("Model refused")
    );
    expect(screen.getByText("Model refused")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders nothing until the binding has a value", () => {
    const { container } = renderWidget(<AlertWidget id="a1" binding="result" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ListWidget", () => {
  it("renders an array binding as items", () => {
    renderWidget(<ListWidget id="l1" binding="result" />, withOutput(["a", "b"]));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("falls back to the placeholder when the binding is empty", () => {
    renderWidget(<ListWidget id="l1" binding="result" placeholder="Nothing" />);
    expect(screen.getByText("Nothing")).toBeInTheDocument();
  });
});

describe("KeyValueWidget", () => {
  it("renders an object binding as label/value rows", () => {
    renderWidget(
      <KeyValueWidget id="k1" binding="result" />,
      withOutput({ model: "sonnet", tokens: 42 })
    );
    expect(screen.getByText("model")).toBeInTheDocument();
    expect(screen.getByText("sonnet")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders a non-object binding as a single row", () => {
    renderWidget(<KeyValueWidget id="k1" binding="result" />, withOutput("solo"));
    expect(screen.getByText("value")).toBeInTheDocument();
    expect(screen.getByText("solo")).toBeInTheDocument();
  });
});

describe("StatWidget", () => {
  it("shows the bound value, and the placeholder when there is none", () => {
    const { unmount } = renderWidget(
      <StatWidget id="s1" binding="result" label="Score" />,
      withOutput(99)
    );
    expect(screen.getByText("99")).toBeInTheDocument();
    unmount();

    renderWidget(<StatWidget id="s1" binding="result" placeholder="—" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("DownloadWidget", () => {
  it("links to the bound file", () => {
    renderWidget(
      <DownloadWidget id="d1" binding="result" label="Get it" />,
      withOutput({ type: "document", uri: "https://example.test/report.pdf" })
    );
    expect(screen.getByRole("link", { name: "Get it" })).toHaveAttribute(
      "href",
      "https://example.test/report.pdf"
    );
  });

  it("shows the placeholder before a run produces anything", () => {
    renderWidget(
      <DownloadWidget id="d1" binding="result" placeholder="Not yet" />
    );
    expect(screen.getByText("Not yet")).toBeInTheDocument();
  });
});

describe("RadioGroupWidget", () => {
  it("writes the picked option to its binding", async () => {
    const user = userEvent.setup();
    const { store } = renderWidget(
      <RadioGroupWidget id="r1" binding="prompt" options={OPTIONS} />
    );
    await user.click(screen.getByRole("radio", { name: "Blue" }));
    expect(inputValue(store.getState())).toBe("Blue");
  });
});

describe("CheckboxGroupWidget", () => {
  it("writes the checked options as an array in option order", async () => {
    const user = userEvent.setup();
    const { store } = renderWidget(
      <CheckboxGroupWidget id="c1" binding="prompt" options={OPTIONS} />
    );
    await user.click(screen.getByRole("checkbox", { name: "Blue" }));
    expect(inputValue(store.getState())).toEqual(["Blue"]);
    await user.click(screen.getByRole("checkbox", { name: "Red" }));
    expect(inputValue(store.getState())).toEqual(["Red", "Blue"]);
  });

  it("unchecks an option without dropping the others", async () => {
    const user = userEvent.setup();
    const { store } = renderWidget(
      <CheckboxGroupWidget id="c1" binding="prompt" options={OPTIONS} />,
      withInput(["Red", "Blue"])
    );
    await user.click(screen.getByRole("checkbox", { name: "Red" }));
    expect(inputValue(store.getState())).toEqual(["Blue"]);
  });
});

describe("TabsWidget", () => {
  it("shows the first named tab and switches on click", async () => {
    const user = userEvent.setup();
    renderWidget(
      <TabsWidget
        tab1Label="One"
        tab2Label="Two"
        tab1={slot("first pane")}
        tab2={slot("second pane")}
      />
    );
    expect(screen.getByText("first pane")).toBeVisible();
    expect(screen.getByText("second pane")).not.toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Two" }));
    expect(screen.getByText("second pane")).toBeVisible();
    expect(screen.getByText("first pane")).not.toBeVisible();
  });

  it("drops tabs whose label is blank", () => {
    renderWidget(
      <TabsWidget tab1Label="One" tab2Label="" tab1={slot("only pane")} />
    );
    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });
});

describe("AccordionWidget", () => {
  it("renders its slot under the title", () => {
    renderWidget(
      <AccordionWidget title="Advanced" content={slot("inner")} defaultOpen />
    );
    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByText("inner")).toBeInTheDocument();
  });
});
