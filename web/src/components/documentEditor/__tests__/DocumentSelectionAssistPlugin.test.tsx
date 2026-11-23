import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor
} from "lexical";
import { useEffect } from "react";

import mockTheme from "../../../__mocks__/themeMock";
import { useDocumentTextAssist } from "../../../hooks/document/useDocumentTextAssist";
import { DOCUMENT_NODES } from "../markdownBlockCodec";
import { DOCUMENT_THEME } from "../documentEditorStyles";
import { DocumentSelectionAssistPlugin } from "../DocumentSelectionAssistPlugin";

jest.mock("../../../hooks/document/useDocumentTextAssist", () => ({
  useDocumentTextAssist: jest.fn()
}));

const mockedUseAssist = useDocumentTextAssist as jest.Mock;

function EditorHarness({
  text = "Hello informal world",
  selectRange = [6, 14],
  onReady
}: {
  text?: string;
  selectRange?: [number, number] | null;
  onReady: (editor: LexicalEditor) => void;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        const node = $createTextNode(text);
        paragraph.append(node);
        root.append(paragraph);
        if (selectRange) {
          node.select(selectRange[0], selectRange[1]);
        }
      },
      { discrete: true }
    );
    onReady(editor);
  }, [editor, onReady, selectRange, text]);
  return null;
}

function renderPlugin({
  text = "Hello informal world",
  selectRange = [6, 14] as [number, number] | null,
  onReady = jest.fn()
}: {
  text?: string;
  selectRange?: [number, number] | null;
  onReady?: (editor: LexicalEditor) => void;
} = {}) {
  return render(
    <ThemeProvider theme={mockTheme}>
      <LexicalComposer
        initialConfig={{
          namespace: "assist-test",
          nodes: [...DOCUMENT_NODES],
          theme: DOCUMENT_THEME,
          onError: (error) => {
            throw error;
          }
        }}
      >
        <RichTextPlugin
          contentEditable={<ContentEditable aria-label="editor" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <EditorHarness text={text} selectRange={selectRange} onReady={onReady} />
        <DocumentSelectionAssistPlugin getMarkdown={() => text} />
      </LexicalComposer>
    </ThemeProvider>
  );
}

describe("DocumentSelectionAssistPlugin (R10)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a hovering AI icon on selection, opens the popup on click, and lets the user edit before Replace", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockedUseAssist.mockReturnValue({
      status: "idle" as const,
      reply: { mode: "replace" as const, text: "formal", why: "" },
      error: null,
      errorDetail: null,
      ask: jest.fn(),
      followUp: jest.fn(),
      cancel: jest.fn(),
      reset: jest.fn()
    });

    let editorRef: LexicalEditor | null = null;
    renderPlugin({
      onReady: (editor) => {
        editorRef = editor;
      }
    });

    fireEvent.mouseUp(screen.getByLabelText("editor"));

    // Selecting text shows only the hovering AI icon, not the full prompt popup.
    const triggerButton = screen.getByRole("button", {
      name: "Ask assistant about selection"
    });
    expect(triggerButton).toBeInTheDocument();
    expect(screen.queryByLabelText("Instruction")).toBeNull();

    await user.click(triggerButton);

    const proposalInput = await screen.findByLabelText("Edit proposed replacement");
    expect(proposalInput).toHaveValue("formal");

    await user.clear(proposalInput);
    await user.type(proposalInput, "distinguished");

    await user.click(screen.getByRole("button", { name: "Replace" }));

    await waitFor(() => {
      const content = editorRef!
        .getEditorState()
        .read(() => $getRoot().getTextContent());
      expect(content).toBe("Hello distinguished world");
    });
  });

  it("keeps note replies read-only without an editable proposal field", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockedUseAssist.mockReturnValue({
      status: "idle",
      reply: { mode: "note", text: "This sentence uses casual phrasing.", why: "" },
      error: null,
      errorDetail: null,
      ask: jest.fn(),
      followUp: jest.fn(),
      cancel: jest.fn(),
      reset: jest.fn()
    });

    renderPlugin();

    fireEvent.mouseUp(screen.getByLabelText("editor"));
    await user.click(
      screen.getByRole("button", { name: "Ask assistant about selection" })
    );

    expect(
      await screen.findByText("This sentence uses casual phrasing.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit proposed replacement")).toBeNull();
    expect(screen.queryByRole("button", { name: "Replace" })).toBeNull();
  });

  it("shows the hovering AI icon immediately when mouseup lands outside the editable element or on short selections", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockedUseAssist.mockReturnValue({
      status: "idle",
      reply: null,
      error: null,
      errorDetail: null,
      ask: jest.fn(),
      followUp: jest.fn(),
      cancel: jest.fn(),
      reset: jest.fn()
    });

    renderPlugin({ text: "AI notes", selectRange: [0, 2] });

    // Drag starts inside the editor and releases outside (e.g., on the page margin).
    fireEvent.mouseDown(screen.getByLabelText("editor"), { button: 0 });
    fireEvent.mouseUp(window);

    const triggerButton = screen.getByRole("button", {
      name: "Ask assistant about selection"
    });
    expect(triggerButton).toBeInTheDocument();
    expect(screen.queryByLabelText("Instruction")).toBeNull();

    await user.click(triggerButton);
    expect(screen.getByLabelText("Instruction")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("updates the hovering AI icon on SELECTION_CHANGE_COMMAND and hides when selection collapses", () => {
    mockedUseAssist.mockReturnValue({
      status: "idle",
      reply: null,
      error: null,
      errorDetail: null,
      ask: jest.fn(),
      followUp: jest.fn(),
      cancel: jest.fn(),
      reset: jest.fn()
    });

    let editorRef: LexicalEditor | null = null;
    renderPlugin({
      onReady: (editor) => {
        editorRef = editor;
      }
    });

    act(() => {
      editorRef!.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
    });
    expect(
      screen.getByRole("button", { name: "Ask assistant about selection" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Instruction")).toBeNull();

    // Collapsing the selection hides the hovering AI icon.
    act(() => {
      editorRef!.update(
        () => {
          $getRoot().selectEnd();
        },
        { discrete: true }
      );
      editorRef!.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
    });
    expect(
      screen.queryByRole("button", { name: "Ask assistant about selection" })
    ).toBeNull();
  });

  it("does not reopen on unrelated clicks after dismissal, and shows the icon again on a new editor selection", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockedUseAssist.mockReturnValue({
      status: "idle",
      reply: { mode: "replace", text: "formal", why: "" },
      error: null,
      errorDetail: null,
      ask: jest.fn(),
      followUp: jest.fn(),
      cancel: jest.fn(),
      reset: jest.fn()
    });

    renderPlugin();
    const editable = screen.getByLabelText("editor");

    fireEvent.mouseUp(editable);
    await user.click(
      screen.getByRole("button", { name: "Ask assistant about selection" })
    );
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByLabelText("Instruction")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Ask assistant about selection" })
    ).toBeNull();

    // Clicking outside the editor (e.g., a toolbar button) does not reopen the dismissed trigger or popup.
    fireEvent.mouseDown(document.body, { button: 0 });
    fireEvent.mouseUp(document.body);
    expect(
      screen.queryByRole("button", { name: "Ask assistant about selection" })
    ).toBeNull();

    // Starting a new selection inside the editor shows the hovering AI icon again.
    fireEvent.mouseDown(editable, { button: 0 });
    fireEvent.mouseUp(window);
    expect(
      screen.getByRole("button", { name: "Ask assistant about selection" })
    ).toBeInTheDocument();
  });

  it("renders the thinking indicator at compact caption scale", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockedUseAssist.mockReturnValue({
      status: "running",
      reply: null,
      error: null,
      errorDetail: null,
      ask: jest.fn(),
      followUp: jest.fn(),
      cancel: jest.fn(),
      reset: jest.fn()
    });

    renderPlugin();
    fireEvent.mouseUp(screen.getByLabelText("editor"));
    await user.click(
      screen.getByRole("button", { name: "Ask assistant about selection" })
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Thinking…");
    expect(screen.getByTestId("thinking-mark")).toHaveStyle({ height: "10px" });
    expect(status.parentElement).toHaveStyle({ fontSize: "var(--fontSizeSmaller)" });
  });
});
