import { act, fireEvent, render, screen } from "@testing-library/react";
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
  type LexicalEditor
} from "lexical";
import { useEffect, useRef } from "react";

import mockTheme from "../../../__mocks__/themeMock";
import { DOCUMENT_NODES } from "../markdownBlockCodec";
import { DOCUMENT_THEME } from "../documentEditorStyles";
import { DocumentPersistentSelectionPlugin } from "../DocumentPersistentSelectionPlugin";

function SeedEditor({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        const text = $createTextNode("Selected passage for assistant");
        paragraph.append(text);
        root.append(paragraph);
        text.select(0, 16);
      },
      { discrete: true }
    );
    onReady(editor);
  }, [editor, onReady]);
  return null;
}

function Harness({
  onReady,
  zoom
}: {
  onReady: (editor: LexicalEditor) => void;
  zoom?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  return (
    <ThemeProvider theme={mockTheme}>
      <LexicalComposer
        initialConfig={{
          namespace: "persistent-selection-test",
          nodes: [...DOCUMENT_NODES],
          theme: DOCUMENT_THEME,
          onError: (error) => {
            throw error;
          }
        }}
      >
        <div ref={containerRef} data-testid="doc-page">
          <RichTextPlugin
            contentEditable={<ContentEditable aria-label="editor" />}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <SeedEditor onReady={onReady} />
        <DocumentPersistentSelectionPlugin
          containerRef={containerRef}
          zoom={zoom}
        />
      </LexicalComposer>
    </ThemeProvider>
  );
}

describe("DocumentPersistentSelectionPlugin (R7)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders non-interactive selection overlays on blur and clears them on focus", () => {
    let editorRef: LexicalEditor | null = null;
    render(
      <Harness
        onReady={(editor) => {
          editorRef = editor;
        }}
      />
    );

    const page = screen.getByTestId("doc-page");
    const editable = screen.getByLabelText("editor");

    jest.spyOn(page, "getBoundingClientRect").mockReturnValue({
      top: 10,
      left: 20,
      right: 520,
      bottom: 410,
      width: 500,
      height: 400,
      x: 20,
      y: 10,
      toJSON: () => ({})
    });

    const textNode = editable.querySelector("span")?.firstChild ?? editable;
    const fakeRect = {
      top: 50,
      left: 60,
      right: 200,
      bottom: 70,
      width: 140,
      height: 20,
      x: 60,
      y: 50,
      toJSON: () => ({})
    } as DOMRect;
    const fakeRange = {
      collapsed: false,
      startContainer: textNode,
      endContainer: textNode,
      cloneRange: () => fakeRange,
      getClientRects: () => [fakeRect] as unknown as DOMRectList
    } as unknown as Range;

    jest.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => fakeRange,
      setBaseAndExtent: jest.fn(),
      removeAllRanges: jest.fn(),
      addRange: jest.fn()
    } as unknown as Selection);

    fireEvent.blur(editable);

    const overlays = page.querySelectorAll(".doc-persistent-selection");
    expect(overlays).toHaveLength(1);
    const overlay = overlays[0] as HTMLElement;
    expect(overlay.style.top).toBe("40px");
    expect(overlay.style.left).toBe("40px");
    expect(overlay.style.width).toBe("140px");
    expect(overlay.style.height).toBe("20px");
    expect(overlay).toHaveAttribute("aria-hidden", "true");

    // Focus clears overlays.
    fireEvent.focus(editable);
    expect(page.querySelectorAll(".doc-persistent-selection")).toHaveLength(0);

    // Collapsing the Lexical selection prevents overlays on subsequent blur.
    act(() => {
      editorRef!.update(
        () => {
          const root = $getRoot();
          root.selectEnd();
        },
        { discrete: true }
      );
    });
    fireEvent.blur(editable);
    expect(page.querySelectorAll(".doc-persistent-selection")).toHaveLength(0);
  });

  it("re-measures overlays on zoom change and non-overlapping updates, and clears when the selected node is removed", () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const flushRaf = () => {
      act(() => {
        const queued = rafCallbacks.splice(0, rafCallbacks.length);
        for (const callback of queued) {
          callback(16);
        }
      });
    };

    let editorRef: LexicalEditor | null = null;
    const handleReady = (editor: LexicalEditor) => {
      editorRef = editor;
    };
    const { rerender } = render(<Harness onReady={handleReady} zoom={1} />);

    const page = screen.getByTestId("doc-page");
    const editable = screen.getByLabelText("editor");

    jest.spyOn(page, "getBoundingClientRect").mockReturnValue({
      top: 10,
      left: 20,
      right: 520,
      bottom: 410,
      width: 500,
      height: 400,
      x: 20,
      y: 10,
      toJSON: () => ({})
    });

    const textNode = editable.querySelector("span")?.firstChild ?? editable;
    let currentRect = {
      top: 50,
      left: 60,
      right: 200,
      bottom: 70,
      width: 140,
      height: 20,
      x: 60,
      y: 50,
      toJSON: () => ({})
    } as DOMRect;
    const fakeRange = {
      collapsed: false,
      startContainer: textNode,
      endContainer: textNode,
      cloneRange: () => fakeRange,
      getClientRects: () => [currentRect] as unknown as DOMRectList
    } as unknown as Range;

    jest.spyOn(window, "getSelection").mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => fakeRange,
      setBaseAndExtent: jest.fn(),
      removeAllRanges: jest.fn(),
      addRange: jest.fn()
    } as unknown as Selection);

    fireEvent.blur(editable);
    let overlay = page.querySelector(".doc-persistent-selection") as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.top).toBe("40px");
    expect(overlay.style.width).toBe("140px");

    // Changing zoom while blurred schedules a rAF recompute and updates rect geometry.
    currentRect = {
      ...currentRect,
      top: 62,
      left: 72,
      width: 168,
      height: 24
    } as DOMRect;
    rerender(<Harness onReady={handleReady} zoom={1.2} />);
    flushRaf();

    overlay = page.querySelector(".doc-persistent-selection") as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.top).toBe("52px");
    expect(overlay.style.left).toBe("52px");
    expect(overlay.style.width).toBe("168px");
    expect(overlay.style.height).toBe("24px");

    // Non-overlapping Lexical update while blurred (e.g. direct-apply inserts paragraph above)
    // preserves and re-measures the overlay instead of wiping it.
    currentRect = {
      ...currentRect,
      top: 110,
      left: 72,
      width: 168,
      height: 24
    } as DOMRect;
    act(() => {
      editorRef!.update(
        () => {
          const root = $getRoot();
          const inserted = $createParagraphNode();
          inserted.append($createTextNode("Inserted paragraph above"));
          root.getFirstChild()?.insertBefore(inserted);
        },
        { discrete: true }
      );
    });
    flushRaf();

    overlay = page.querySelector(".doc-persistent-selection") as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.top).toBe("100px");

    // Removing the selected node disconnects the saved range and clears overlays.
    act(() => {
      editorRef!.update(
        () => {
          const root = $getRoot();
          root.clear();
          const replacement = $createParagraphNode();
          replacement.append($createTextNode("Fresh document"));
          root.append(replacement);
        },
        { discrete: true }
      );
    });
    flushRaf();

    expect(page.querySelectorAll(".doc-persistent-selection")).toHaveLength(0);
  });
});
