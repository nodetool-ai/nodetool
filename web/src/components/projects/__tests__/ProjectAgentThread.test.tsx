/**
 * The project conversation, rendered for a narrow column: user turns as
 * bubbles, agent turns as text plus a chip per tool it called, and what is
 * running right now. Roles the column cannot render are dropped rather than
 * flattened into something that reads wrong.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Message } from "../../../stores/ApiTypes";

jest.mock("../../chat/message/ChatMarkdown", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>
}));

import ProjectAgentThread from "../ProjectAgentThread";

const renderThread = (
  messages: Message[],
  runningToolMessage?: string | null
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectAgentThread
        messages={messages}
        runningToolMessage={runningToolMessage}
      />
    </ThemeProvider>
  );

describe("ProjectAgentThread", () => {
  it("says the project has no conversation rather than rendering an empty column", () => {
    renderThread([]);
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
  });

  it("renders both turn shapes and names each tool the agent called", () => {
    renderThread([
      {
        id: "m1",
        role: "user",
        content: [{ type: "text", text: "Make a 30-second launch spot." }]
      },
      {
        id: "m2",
        role: "assistant",
        content: "Broke the spot into 8 shots.",
        tool_calls: [
          { id: "t1", name: "create_storyboard", args: {} },
          { id: "t2", name: "voice_script_lines", args: {} }
        ]
      }
    ]);
    expect(
      screen.getByText("Make a 30-second launch spot.")
    ).toBeInTheDocument();
    expect(screen.getByText("Broke the spot into 8 shots.")).toBeInTheDocument();
    expect(screen.getByText("create_storyboard")).toBeInTheDocument();
    expect(screen.getByText("voice_script_lines")).toBeInTheDocument();
  });

  it("drops a role it cannot render compactly instead of guessing at it", () => {
    renderThread([
      { id: "m3", role: "agent_execution", content: "step 1 of 4" }
    ]);
    expect(screen.queryByText("step 1 of 4")).not.toBeInTheDocument();
  });

  it("shows what the agent is doing while it is doing it", () => {
    renderThread([], "rendering shot 7");
    expect(screen.getByText("rendering shot 7")).toBeInTheDocument();
  });
});
