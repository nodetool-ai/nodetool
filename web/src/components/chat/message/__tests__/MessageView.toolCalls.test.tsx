import { asMock } from "../../../../test-utils/doubles";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MessageView } from "../MessageView";
import mockTheme from "../../../../__mocks__/themeMock";
import { Message, ToolCall } from "../../../../stores/ApiTypes";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";

// The store hook is called with a selector; default to an empty store so no
// tool is "running". Tests can swap the implementation to inject runtime.
jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: jest.fn(<T,>(selector: (s: unknown) => T) => selector({}))
}));

jest.mock("../../../../contexts/EditorInsertionContext", () => ({
  useEditorInsertion: () => undefined
}));

const mockWriteClipboard = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../hooks/browser/useClipboard", () => ({
  useClipboard: () => ({ writeClipboard: mockWriteClipboard })
}));

jest.mock("../ChatMarkdown", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>
}));

const renderView = (message: Message) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MessageView
        message={message}
        isThoughtExpanded={() => false}
        onToggleThought={() => {}}
      />
    </ThemeProvider>
  );

const toolCall = (id: string, name: string): ToolCall => ({
  id,
  name,
  args: {}
});

describe("MessageView tool-call timeline", () => {
  it("renders every call as a connected row under one footer", () => {
    renderView({
      id: "m1",
      role: "assistant",
      tool_calls: [
        toolCall("a", "search"),
        toolCall("b", "read_file"),
        toolCall("c", "write_file"),
        toolCall("d", "run_tests")
      ]
    } as Message);

    expect(document.querySelectorAll(".tool-timeline-rows > .tool-row"))
      .toHaveLength(4);
    expect(screen.getByText("Ran 1 search")).toBeInTheDocument();
    expect(screen.getByText("Run Tests")).toBeInTheDocument();
    expect(screen.getByText("4 steps")).toBeInTheDocument();
    // The hairline runs to the next row, and stops at the last one.
    expect(document.querySelectorAll(".tool-row-connector")).toHaveLength(3);
  });

  it("rerenders only the active message when a thought is toggled", async () => {
    const user = userEvent.setup();
    let expanded = false;
    render(
      <ThemeProvider theme={mockTheme}>
        <MessageView
          message={
            {
              id: "thought-message",
              role: "assistant",
              content: "<think>Private reasoning</think>Final answer"
            } as Message
          }
          isThoughtExpanded={() => expanded}
          onToggleThought={() => {
            expanded = !expanded;
          }}
        />
      </ThemeProvider>
    );

    expect(screen.queryByText("Private reasoning")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show thought/i }));
    expect(screen.getByText("Private reasoning")).toBeInTheDocument();
  });

  it("folds the rows away when the footer is toggled", async () => {
    const user = userEvent.setup();
    renderView({
      id: "m2",
      role: "assistant",
      tool_calls: [toolCall("a", "search"), toolCall("b", "run_tests")]
    } as Message);

    expect(screen.getByText("Run Tests")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /2 steps/i }));

    // Collapse unmounts its children once the exit transition finishes.
    await waitFor(() => {
      expect(screen.queryByText("Run Tests")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Ran 1 search")).not.toBeInTheDocument();
  });

  it("counts a call with an empty result as completed in the footer", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <MessageView
          message={
            {
              id: "m4",
              role: "assistant",
              tool_calls: [toolCall("a", "search"), toolCall("b", "run_tests")]
            } as Message
          }
          isThoughtExpanded={() => false}
          onToggleThought={() => {}}
          toolResultsByCallId={{
            // Empty-string content still means the tool responded.
            a: { name: "search", content: "" }
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("2 steps")).toBeInTheDocument();
  });

  it("renders a lone tool call with no footer and no hairline", () => {
    renderView({
      id: "m3",
      role: "assistant",
      tool_calls: [toolCall("a", "search")]
    } as Message);

    expect(document.querySelector(".tool-timeline-footer")).toBeNull();
    expect(document.querySelector(".tool-row-connector")).toBeNull();
    expect(screen.getByText("Ran 1 search")).toBeInTheDocument();
  });

  it("collapses consecutive same-tool calls into one closed run", () => {
    renderView({
      id: "m-run",
      role: "assistant",
      tool_calls: [
        {
          id: "a",
          name: "web_search",
          args: { query: "facebook ads" },
          message: "Searching the web"
        },
        {
          id: "b",
          name: "web_search",
          args: { query: "tiktok creative" },
          message: "Searching the web"
        },
        {
          id: "c",
          name: "web_search",
          args: { query: "linkedin tests" },
          message: "Searching the web"
        }
      ]
    } as Message);

    expect(document.querySelector(".tool-timeline-footer")).toBeNull();
    expect(screen.getByText("Searching the web")).toBeInTheDocument();
    expect(
      screen.getByText("facebook ads · tiktok creative · linkedin tests")
    ).toBeInTheDocument();
    expect(document.querySelector(".tool-row-children")).toBeNull();
  });

  it("expands a counted run to a row per call", async () => {
    const user = userEvent.setup();
    renderView({
      id: "m-run-open",
      role: "assistant",
      tool_calls: [
        {
          id: "a",
          name: "web_search",
          args: { query: "one" },
          message: "Searching the web"
        },
        {
          id: "b",
          name: "web_search",
          args: { query: "two" },
          message: "Searching the web"
        }
      ]
    } as Message);

    await user.click(
      screen.getByRole("button", { name: /searching the web, 2 web_search/i })
    );

    expect(document.querySelectorAll(".tool-row-children .tool-row"))
      .toHaveLength(2);
  });

  it("keeps execute_code rows ungrouped next to a search run", () => {
    renderView({
      id: "m-mixed",
      role: "assistant",
      tool_calls: [
        {
          id: "code",
          name: "execute_code",
          args: { title: "Planning ad framework research", code: "1" }
        },
        {
          id: "a",
          name: "web_search",
          args: { query: "one" },
          message: "Searching the web"
        },
        {
          id: "b",
          name: "web_search",
          args: { query: "two" },
          message: "Searching the web"
        }
      ]
    } as Message);

    expect(
      screen.getByRole("button", { name: /planning ad framework research/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Searching the web")).toBeInTheDocument();
    expect(screen.getByText("3 steps")).toBeInTheDocument();
  });
});

describe("MessageView CodeAct actions", () => {
  it("renders execute_code's program as a formatted code block, not JSON args", async () => {
    const user = userEvent.setup();
    renderView({
      id: "m5",
      role: "assistant",
      tool_calls: [
        {
          id: "a",
          name: "execute_code",
          args: {
            code: "const x = await tools.add({a: 1, b: 2}); return x;"
          }
        }
      ]
    } as Message);

    // CodeAct rows start collapsed — the program is behind the row.
    expect(screen.queryByText("Code")).not.toBeInTheDocument();
    expect(document.querySelector(".code-block-container")).toBeNull();

    await user.click(screen.getByRole("button", { name: /execute code/i }));

    expect(screen.getByText("Code")).toBeInTheDocument();
    // Prism splits the program into token spans; read the block's text.
    await waitFor(() => {
      const block = document.querySelector(".code-block-container");
      expect(block?.textContent).toContain("const x = await tools.add({");
      expect(block?.textContent).toContain("return x;");
    });
    // Packed statements are split onto their own lines.
    await waitFor(() => {
      const block = document.querySelector(".code-block-container");
      expect(block?.textContent).toMatch(/}\);\s*return x;/);
    });
    // The lone `code` arg is lifted out — no leftover Arguments JSON section.
    expect(screen.queryByText("Arguments")).not.toBeInTheDocument();
  });

  it("shows the action's title as the row label", () => {
    renderView({
      id: "m6",
      role: "assistant",
      tool_calls: [
        {
          id: "b",
          name: "execute_code",
          args: {
            title: "Rendering product images from CSV",
            code: "await tools.run_workflow({});"
          }
        }
      ]
    } as Message);

    expect(
      screen.getByRole("button", { name: /rendering product images from csv/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("Code")).not.toBeInTheDocument();
    // The generic tool-name fallback is replaced, and `title` is not
    // duplicated into an Arguments section.
    expect(screen.queryByText(/^execute code$/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Arguments")).not.toBeInTheDocument();
  });

  it("shows the in-flight media prediction on a running execute_code row", () => {
    const store = asMock(useGlobalChatStore);
    const state = {
      currentThreadId: "t1",
      currentRunningToolCallId: "a",
      currentToolMessage: "Running code",
      threadRuntime: {
        t1: {
          activePredictions: [
            {
              id: "p1",
              provider: "fal_ai",
              model: "flux-schnell",
              capability: "text_to_image",
              startedAt: Date.now()
            }
          ]
        }
      }
    };
    store.mockImplementation(<T,>(selector: (s: typeof state) => T) =>
      selector(state)
    );

    renderView({
      id: "m-running",
      role: "assistant",
      tool_calls: [
        {
          id: "a",
          name: "execute_code",
          args: {
            title: "Render a fox",
            code: "await nodetool.media.generateImage('fox', model);"
          }
        }
      ]
    } as Message);

    expect(
      screen.getByText(/generating image · fal_ai · flux-schnell/i)
    ).toBeInTheDocument();
    expect(screen.getByText("0s")).toBeInTheDocument();

    store.mockImplementation(<T,>(selector: (s: unknown) => T) =>
      selector({})
    );
  });
});

describe("MessageView tool-call result copy", () => {
  beforeEach(() => {
    mockWriteClipboard.mockClear();
  });

  it("copies a string result from the Result header", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <MessageView
          message={
            {
              id: "m7",
              role: "assistant",
              tool_calls: [toolCall("a", "read_file")]
            } as Message
          }
          isThoughtExpanded={() => false}
          onToggleThought={() => {}}
          toolResultsByCallId={{
            a: { name: "read_file", content: "file body" }
          }}
        />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: /read file/i }));
    expect(screen.getByText("Result")).toBeInTheDocument();
    expect(screen.getByText("file body")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copy result/i }));
    expect(mockWriteClipboard).toHaveBeenCalledWith("file body", true);
  });

  it("copies a JSON result as pretty-printed text", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <MessageView
          message={
            {
              id: "m8",
              role: "assistant",
              tool_calls: [toolCall("a", "search")]
            } as Message
          }
          isThoughtExpanded={() => false}
          onToggleThought={() => {}}
          toolResultsByCallId={{
            a: { name: "search", content: { hits: [1, 2] } }
          }}
        />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: /search/i }));
    await user.click(screen.getByRole("button", { name: /copy result/i }));
    expect(mockWriteClipboard).toHaveBeenCalledWith(
      JSON.stringify({ hits: [1, 2] }, null, 2),
      true
    );
  });
});

describe("MessageView create_plan", () => {
  it("renders the plan in the thread, not as collapsed JSON", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <MessageView
          message={
            {
              id: "m-plan",
              role: "assistant",
              tool_calls: [
                {
                  id: "p1",
                  name: "create_plan",
                  args: { objective: "add caching to the api" }
                }
              ]
            } as Message
          }
          isThoughtExpanded={() => false}
          onToggleThought={() => {}}
          toolResultsByCallId={{
            p1: {
              name: "create_plan",
              content: {
                title: "Add caching",
                executed: false,
                parallelizable: 1,
                tasks: [
                  {
                    id: "inspect",
                    title: "Inspect the cache layer",
                    depends_on: [],
                    steps: [
                      {
                        id: "s1",
                        instructions: "Read the current cache config"
                      }
                    ]
                  }
                ]
              }
            }
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByText("add caching to the api")).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Add caching" })
    ).toBeInTheDocument();
    expect(screen.getByText("Inspect the cache layer")).toBeInTheDocument();
    expect(
      screen.getByText("Read the current cache config")
    ).toBeInTheDocument();
    expect(screen.queryByText("Result")).not.toBeInTheDocument();
    expect(document.querySelector(".pretty-json")).toBeNull();
  });
});
