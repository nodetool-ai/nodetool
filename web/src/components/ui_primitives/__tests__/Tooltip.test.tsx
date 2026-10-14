import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { Tooltip } from "../Tooltip";
import { ToolbarIconButton } from "../ToolbarIconButton";
import { resetTooltipPointerGate } from "../tooltipPointerGate";
import { EditorButton } from "../../editor_ui/EditorButton";
import mockTheme from "../../../__mocks__/themeMock";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

const hoverAndWait = (element: HTMLElement) => {
  jest.useFakeTimers();
  fireEvent.mouseOver(element);
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  jest.useRealTimers();
};

describe("Tooltip", () => {
  it("draws the shortcut as a key hint below the title", () => {
    renderWithTheme(
      <Tooltip title="Undo" shortcut={["Ctrl", "Z"]}>
        <button type="button" aria-label="Undo" />
      </Tooltip>
    );

    hoverAndWait(screen.getByRole("button", { name: "Undo" }));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Undo");
    expect(tooltip).toHaveTextContent("Ctrl");
    expect(tooltip).toHaveTextContent("Z");
  });

  it("renders only the children when disabled", () => {
    renderWithTheme(
      <Tooltip title="Next match" disabled>
        <button type="button">Next</button>
      </Tooltip>
    );

    hoverAndWait(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("Tooltip after a pointer press", () => {
  afterEach(() => {
    resetTooltipPointerGate();
    jest.restoreAllMocks();
  });

  // jsdom has no PointerEvent; a MouseEvent carries the coordinates.
  const pointer = (type: string, element: Element, x: number, y: number) => {
    jest.useFakeTimers();
    act(() => {
      element.dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
      );
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    jest.useRealTimers();
  };
  const press = (element: Element, x = 10, y = 10) =>
    pointer("pointerdown", element, x, y);

  it("closes when its trigger is clicked and stays closed under a resting pointer", () => {
    renderWithTheme(
      <ToolbarIconButton tooltip="Entities" icon={<span />} onClick={() => {}} />
    );
    const button = screen.getByRole("button", { name: "Entities" });

    hoverAndWait(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Entities");

    press(button);
    fireEvent.click(button);
    hoverAndWait(button);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes an open row tooltip when a press lands elsewhere, such as a context menu", () => {
    renderWithTheme(
      <>
        <Tooltip title="Harbor Noir">
          <span>Harbor Noir</span>
        </Tooltip>
        <button type="button">Open</button>
      </>
    );

    hoverAndWait(screen.getByText("Harbor Noir"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    press(screen.getByRole("button", { name: "Open" }));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not open on an element a closing menu leaves under the pointer", () => {
    renderWithTheme(
      <>
        <button type="button">Model</button>
        <Tooltip title="Cut a timeline to music">
          <span>Beat sync editing</span>
        </Tooltip>
      </>
    );

    press(screen.getByRole("button", { name: "Model" }), 400, 300);
    hoverAndWait(screen.getByText("Beat sync editing"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    pointer("pointermove", document.body, 420, 300);
    hoverAndWait(screen.getByText("Beat sync editing"));
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Cut a timeline to music"
    );
  });

  it("opens again once the pointer moves onto another element", () => {
    renderWithTheme(
      <>
        <button type="button">Run</button>
        <Tooltip title="Pick a tool">
          <span>Select</span>
        </Tooltip>
      </>
    );

    press(screen.getByRole("button", { name: "Run" }), 0, 0);
    pointer("pointermove", screen.getByText("Select"), 0, 0);
    hoverAndWait(screen.getByText("Select"));

    expect(screen.getByRole("tooltip")).toHaveTextContent("Pick a tool");
  });

  it("keeps a disabled control's reason open when it is pressed", () => {
    renderWithTheme(
      <Tooltip title="Wait for your files to finish uploading">
        <button type="button" aria-disabled="true">
          Start
        </button>
      </Tooltip>
    );
    const button = screen.getByText("Start");

    press(button);
    hoverAndWait(button);

    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Wait for your files to finish uploading"
    );
  });

  it("still opens on keyboard focus after a press", () => {
    const matches = Element.prototype.matches;
    jest
      .spyOn(Element.prototype, "matches")
      .mockImplementation(function (this: Element, selector: string) {
        return selector === ":focus-visible" ? true : matches.call(this, selector);
      });
    renderWithTheme(
      <Tooltip title="More">
        <button type="button">More</button>
      </Tooltip>
    );
    const button = screen.getByRole("button", { name: "More" });

    press(document.body);
    jest.useFakeTimers();
    act(() => {
      button.focus();
      jest.advanceTimersByTime(1000);
    });
    jest.useRealTimers();

    expect(screen.getByRole("tooltip")).toHaveTextContent("More");
  });
});

describe("EditorButton tooltip", () => {
  it("describes the button without renaming it", () => {
    renderWithTheme(
      <EditorButton tooltip="Lift this node's body into a new script">
        Extract
      </EditorButton>
    );

    const button = screen.getByRole("button", { name: "Extract" });
    expect(button).not.toHaveAttribute("title");
    hoverAndWait(button);

    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Lift this node's body into a new script"
    );
    expect(screen.getByRole("button", { name: "Extract" })).toBeInTheDocument();
  });

  it("still shows the tooltip while the button is disabled", () => {
    renderWithTheme(
      <EditorButton tooltip="This shot is already rendering" disabled>
        Regenerate
      </EditorButton>
    );

    const button = screen.getByRole("button", { name: "Regenerate" });
    hoverAndWait(button.parentElement as HTMLElement);

    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "This shot is already rendering"
    );
  });
});
