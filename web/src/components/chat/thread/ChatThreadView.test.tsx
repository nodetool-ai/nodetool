import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import ChatThreadView from "./ChatThreadView";
import mockTheme from "../../../__mocks__/themeMock";
import { Message } from "../../../stores/ApiTypes";

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
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("ChatThreadView", () => {
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
    progressMessage: null,
  };

  it("renders messages correctly", () => {
    renderWithTheme(<ChatThreadView {...defaultProps} />);
    expect(screen.getByTestId("message-1")).toHaveTextContent("Hello");
    expect(screen.getByTestId("message-2")).toHaveTextContent("Hi there");
  });

  it("renders loading indicator when status is loading", () => {
    renderWithTheme(
      <ChatThreadView {...defaultProps} status="loading" messages={mockMessages} />
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
        currentPlanningUpdate={{
          id: "plan-1",
          status: "in_progress",
          plan: { steps: [] }
        } as any}
      />
    );
    expect(screen.getByTestId("planning-update")).toBeInTheDocument();
  });

  it("renders task update", () => {
    renderWithTheme(
      <ChatThreadView
        {...defaultProps}
        currentTaskUpdate={{
          id: "task-1",
          status: "in_progress",
          task: { id: "t1", description: "test" }
        } as any}
      />
    );
    expect(screen.getByTestId("task-update")).toBeInTheDocument();
  });
});
