import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import ChatThreadView from "./ChatThreadView";
import mockTheme from "../../../__mocks__/themeMock";
import { Message } from "../../../stores/ApiTypes";

const mockScrollToIndex = jest.fn();
let mockTotalSize: number | null = null;

// Bypass virtualization in tests: render every item synchronously.
// jsdom has no layout engine, so @tanstack/react-virtual's measurements
// would return zero and no items would appear.
jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 200,
        end: (index + 1) * 200,
        size: 200,
        lane: 0
      })),
    getTotalSize: () => mockTotalSize ?? count * 200,
    measureElement: () => {},
    scrollToIndex: mockScrollToIndex
  })
}));

// Mock child components to isolate ChatThreadView logic
jest.mock("../message/MessageView", () => ({
  MessageView: ({ message }: { message: Message }) => (
    <div data-testid={`message-${message.id}`}>
      {Array.isArray(message.content)
        ? (message.content[0] as any).text
        : message.content}
    </div>
  )
}));

jest.mock("../controls/ScrollToBottomButton", () => ({
  ScrollToBottomButton: () => <div data-testid="scroll-to-bottom" />
}));

jest.mock("../../node/PlanningUpdateDisplay", () => ({
  __esModule: true,
  default: () => <div data-testid="planning-update" />
}));

jest.mock("../../node/TaskUpdateDisplay", () => ({
  __esModule: true,
  default: () => <div data-testid="task-update" />
}));

jest.mock("../feedback/LoadingIndicator", () => ({
  LoadingIndicator: () => <div data-testid="loading-indicator" />
}));

jest.mock("../feedback/Progress", () => ({
  Progress: ({ progress }: { progress: number }) => (
    <div data-testid="progress">{progress}%</div>
  )
}));

// Mock ResizeObserver
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserver;

// Mock IntersectionObserver
class IntersectionObserver {
  constructor(_callback: any) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = IntersectionObserver as any;

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }))
});

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("ChatThreadView", () => {
  beforeEach(() => {
    mockTotalSize = null;
  });

  const mockMessages: Message[] = [
    {
      type: "message",
      id: "1",
      role: "user",
      content: "Hello",
      created_at: new Date().toISOString()
    },
    {
      type: "message",
      id: "2",
      role: "assistant",
      content: "Hi there",
      created_at: new Date().toISOString()
    }
  ];

  const defaultProps = {
    messages: mockMessages,
    status: "connected" as const,
    progress: 0,
    total: 100,
    progressMessage: null
  };

  it("renders messages correctly", () => {
    renderWithTheme(<ChatThreadView {...defaultProps} />);
    expect(screen.getByTestId("message-1")).toHaveTextContent("Hello");
    expect(screen.getByTestId("message-2")).toHaveTextContent("Hi there");
  });

  it("does not scroll for streaming tokens that leave layout unchanged", () => {
    const { container, rerender } = renderWithTheme(
      <ChatThreadView {...defaultProps} />
    );
    const scrollHost = container.querySelector(
      ".scrollable-message-wrapper"
    ) as HTMLDivElement;
    const scrollTo = jest.fn();
    scrollHost.scrollTo = scrollTo;

    rerender(
      <ThemeProvider theme={mockTheme}>
        <ChatThreadView
          {...defaultProps}
          status="streaming"
          messages={[
            mockMessages[0],
            { ...mockMessages[1], content: "Hi there, streaming now" }
          ]}
        />
      </ThemeProvider>
    );

    expect(scrollTo).not.toHaveBeenCalled();
    expect(
      container.querySelector(".streaming-runway")
    ).not.toBeInTheDocument();
    expect(scrollHost.style.maskImage).toBe("");
  });

  it("follows a measured streaming height change without animation", () => {
    mockTotalSize = 400;
    const { container, rerender } = renderWithTheme(
      <ChatThreadView {...defaultProps} status="streaming" />
    );
    const scrollHost = container.querySelector(
      ".scrollable-message-wrapper"
    ) as HTMLDivElement;
    const realContent = container.querySelector(
      ".chat-messages-real-content"
    ) as HTMLDivElement;
    Object.defineProperty(scrollHost, "clientHeight", {
      configurable: true,
      value: 200
    });
    scrollHost.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    realContent.getBoundingClientRect = () => ({ bottom: 400 }) as DOMRect;

    mockTotalSize = 500;
    realContent.getBoundingClientRect = () => ({ bottom: 500 }) as DOMRect;
    rerender(
      <ThemeProvider theme={mockTheme}>
        <ChatThreadView {...defaultProps} status="streaming" progress={1} />
      </ThemeProvider>
    );

    expect(scrollHost.scrollTop).toBe(300);
  });

  it("anchors a new user turn until manual navigation takes ownership", () => {
    const rafSpy = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const { container, rerender } = renderWithTheme(
      <ChatThreadView {...defaultProps} />
    );
    const scrollHost = container.querySelector(
      ".scrollable-message-wrapper"
    ) as HTMLDivElement;
    Object.defineProperty(scrollHost, "clientHeight", {
      configurable: true,
      value: 600
    });

    const nextMessages: Message[] = [
      ...mockMessages,
      {
        type: "message",
        id: "3",
        role: "user",
        content: "A follow-up",
        created_at: new Date().toISOString()
      }
    ];
    rerender(
      <ThemeProvider theme={mockTheme}>
        <ChatThreadView
          {...defaultProps}
          messages={nextMessages}
          status="loading"
        />
      </ThemeProvider>
    );

    expect(scrollHost).toHaveAttribute(
      "data-scroll-mode",
      "anchoring-new-turn"
    );
    expect(container.querySelector(".chat-anchor-tail")).toHaveStyle({
      height: "600px"
    });

    act(() => {
      fireEvent.wheel(scrollHost);
    });

    expect(scrollHost).toHaveAttribute("data-scroll-mode", "free-scrolling");
    expect(
      container.querySelector(".chat-anchor-tail")
    ).not.toBeInTheDocument();
    rafSpy.mockRestore();
  });

  it("keeps the new turn anchored at the top after the response settles", () => {
    const rafSpy = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const { container, rerender } = renderWithTheme(
      <ChatThreadView {...defaultProps} />
    );
    const scrollHost = container.querySelector(
      ".scrollable-message-wrapper"
    ) as HTMLDivElement;
    const realContent = container.querySelector(
      ".chat-messages-real-content"
    ) as HTMLDivElement;
    Object.defineProperty(scrollHost, "clientHeight", {
      configurable: true,
      value: 600
    });
    scrollHost.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    realContent.getBoundingClientRect = () => ({ bottom: 500 }) as DOMRect;

    const nextMessages: Message[] = [
      ...mockMessages,
      {
        type: "message",
        id: "3",
        role: "user",
        content: "A follow-up",
        created_at: new Date().toISOString()
      }
    ];
    // New user turn arrives while the request is in flight → anchoring mode.
    rerender(
      <ThemeProvider theme={mockTheme}>
        <ChatThreadView
          {...defaultProps}
          messages={nextMessages}
          status="loading"
        />
      </ThemeProvider>
    );
    expect(scrollHost).toHaveAttribute(
      "data-scroll-mode",
      "anchoring-new-turn"
    );

    // The prompt has landed near the top of the viewport.
    scrollHost.scrollTop = 400;

    // Response settles: stay anchored, do NOT snap the view to the bottom.
    rerender(
      <ThemeProvider theme={mockTheme}>
        <ChatThreadView
          {...defaultProps}
          messages={[
            ...nextMessages,
            {
              type: "message",
              id: "4",
              role: "assistant",
              content: "Answer",
              created_at: new Date().toISOString()
            }
          ]}
          status="connected"
        />
      </ThemeProvider>
    );

    // Regression: previously this switched to "following-end" and bottom-aligned
    // the content, pulling the prompt off the top. It must stay anchored.
    expect(scrollHost).toHaveAttribute(
      "data-scroll-mode",
      "anchoring-new-turn"
    );
    expect(scrollHost.scrollTop).toBe(400);
    // Tail trimmed to just what holds the anchor: scrollTop(400) +
    // clientHeight(600) - realContentBottom(scrollTop 400 + rect.bottom 500) = 100.
    expect(container.querySelector(".chat-anchor-tail")).toHaveStyle({
      height: "100px"
    });
    rafSpy.mockRestore();
  });

  it("lands on the latest message when a thread is first shown", () => {
    const rafSpy = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });
    mockScrollToIndex.mockClear();

    renderWithTheme(<ChatThreadView {...defaultProps} />);

    // Two mock messages → the last (index 1) is aligned to the bottom, so the
    // user doesn't have to scroll down to the end of an existing conversation.
    expect(mockScrollToIndex).toHaveBeenCalledWith(1, { align: "end" });

    rafSpy.mockRestore();
  });

  it("renders loading indicator when status is loading", () => {
    renderWithTheme(
      <ChatThreadView
        {...defaultProps}
        status="loading"
        messages={mockMessages}
      />
    );
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("renders progress bar when progress > 0", () => {
    renderWithTheme(
      <ChatThreadView {...defaultProps} progress={50} messages={mockMessages} />
    );
    expect(screen.getByTestId("progress")).toHaveTextContent("50%");
  });

  it("does not render loading indicator when agent execution messages exist", () => {
    const agentMessages: Message[] = [
      ...mockMessages,
      {
        type: "message",
        id: "3",
        role: "agent_execution",
        content: "Executing...",
        agent_execution_id: "exec-1"
      }
    ];

    renderWithTheme(
      <ChatThreadView
        {...defaultProps}
        messages={agentMessages}
        status="loading"
      />
    );
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  it("renders planning update", () => {
    renderWithTheme(
      <ChatThreadView
        {...defaultProps}
        currentPlanningUpdate={
          {
          id: "plan-1",
          status: "in_progress",
          plan: { steps: [] }
          } as any
        }
      />
    );
    expect(screen.getByTestId("planning-update")).toBeInTheDocument();
  });

  it("renders task update", () => {
    renderWithTheme(
      <ChatThreadView
        {...defaultProps}
        currentTaskUpdate={
          {
          id: "task-1",
          status: "in_progress",
          task: { id: "t1", description: "test" }
          } as any
        }
      />
    );
    expect(screen.getByTestId("task-update")).toBeInTheDocument();
  });
});
