import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { ThoughtSection } from "../thought/ThoughtSection";
import { resetThoughtTimings } from "../thought/thoughtTiming";

let mockStatus = "idle";
jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: jest.fn(<T,>(selector: (s: unknown) => T) =>
    selector({
      currentThreadId: "t1",
      threadRuntime: { t1: { status: mockStatus } }
    })
  )
}));

jest.mock("../ChatMarkdown", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>
}));

const renderSection = (
  props: Partial<React.ComponentProps<typeof ThoughtSection>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ThoughtSection
        thoughtContent="Weighing the options"
        hasClosingTag={false}
        isExpanded={undefined}
        onToggle={jest.fn()}
        {...props}
      />
    </ThemeProvider>
  );

describe("ThoughtSection", () => {
  beforeEach(() => {
    resetThoughtTimings();
    mockStatus = "idle";
  });

  it("stays open and reads Thinking while the model reasons", () => {
    mockStatus = "streaming";
    renderSection();
    const header = screen.getByRole("button", { name: /thinking/i });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Weighing the options")).toBeInTheDocument();
  });

  it("follows its own thread, not the current one", () => {
    mockStatus = "streaming";
    renderSection({ threadId: "t2" });
    expect(
      screen.getByRole("button", { name: /^thought$/i })
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("folds away once the block closes", () => {
    renderSection({ hasClosingTag: true });
    const header = screen.getByRole("button", { name: /^thought$/i });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Weighing the options")).not.toBeInTheDocument();
  });

  it("reports how long it thought after streaming here", () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    mockStatus = "streaming";
    const { rerender } = renderSection();
    jest.setSystemTime(4200);
    mockStatus = "idle";
    rerender(
      <ThemeProvider theme={mockTheme}>
        <ThoughtSection
          thoughtContent="Weighing the options"
          hasClosingTag
          isExpanded={undefined}
          onToggle={jest.fn()}
        />
      </ThemeProvider>
    );
    expect(
      screen.getByRole("button", { name: /thought for 4s/i })
    ).toBeInTheDocument();
    jest.useRealTimers();
  });

  it("does not read Thinking for a reply cut off mid-thought", () => {
    renderSection({ hasClosingTag: false });
    expect(screen.getByRole("button", { name: /^thought$/i })).toBeInTheDocument();
  });

  it("asks to open the row when the reader clicks it", async () => {
    const onToggle = jest.fn();
    renderSection({ hasClosingTag: true, onToggle });
    await userEvent.click(screen.getByRole("button", { name: /^thought$/i }));
    expect(onToggle).toHaveBeenCalledWith(true, expect.anything());
  });
});
