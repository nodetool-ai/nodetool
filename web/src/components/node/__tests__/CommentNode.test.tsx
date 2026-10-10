import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Node, NodeProps } from "@xyflow/react";
import mockTheme from "../../../__mocks__/themeMock";
import { makeNodeStore, nodeStoreRenderers } from "../../../test-utils/nodeStore";
import type { NodeData } from "../../../stores/NodeData";
import CommentNode from "../CommentNode";

// The real plugins need a laid-out contenteditable. This stand-in keeps the
// real OnChangePlugin, shows the editor's text, and types through the API.
jest.mock("../../textEditor/LexicalEditor", () => {
  const { useEffect, useState } = jest.requireActual<typeof import("react")>("react");
  const { useLexicalComposerContext } = jest.requireActual<
    typeof import("@lexical/react/LexicalComposerContext")
  >("@lexical/react/LexicalComposerContext");
  const { OnChangePlugin } = jest.requireActual<
    typeof import("@lexical/react/LexicalOnChangePlugin")
  >("@lexical/react/LexicalOnChangePlugin");
  const lexical = jest.requireActual<typeof import("lexical")>("lexical");
  const readText = (editor: import("lexical").LexicalEditor): string =>
    editor.getEditorState().read(() => lexical.$getRoot().getTextContent());
  const Plugins = ({
    onChange
  }: {
    onChange: (state: import("lexical").EditorState) => void;
  }) => {
    const [editor] = useLexicalComposerContext();
    const [text, setText] = useState(() => readText(editor));
    useEffect(() => {
      setText(readText(editor));
      return editor.registerUpdateListener(() => setText(readText(editor)));
    }, [editor]);
    const type = () =>
      editor.update(
        () => {
          const root = lexical.$getRoot();
          root.clear();
          const paragraph = lexical.$createParagraphNode();
          paragraph.append(lexical.$createTextNode("typed"));
          root.append(paragraph);
        },
        { discrete: true }
      );
    return (
      <>
        {/* Lexical commits updates only once it has a root element. */}
        <div ref={(el) => editor.setRootElement(el)} contentEditable />
        <div data-testid="editor-text">{text}</div>
        <button type="button" onClick={type}>
          type
        </button>
        <OnChangePlugin onChange={onChange} />
      </>
    );
  };
  return { __esModule: true, default: Plugins };
});
jest.mock("../../textEditor/ToolbarPlugin", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../NodeResizeHandle", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../inputs/ColorPicker", () => ({
  __esModule: true,
  default: ({ color }: { color: string }) => (
    <div data-testid="color-picker" data-color={color} />
  )
}));

const updateNodeData = jest.fn();
const { render } = nodeStoreRenderers(
  makeNodeStore({ updateNodeData, updateNode: jest.fn() })
);

const nodeProps = (properties: Record<string, unknown>) =>
  ({
    id: "comment-1",
    type: "nodetool.workflows.base_node.Comment",
    data: {
      properties,
      workflow_id: "wf-1",
      selectable: true,
      dynamic_properties: {}
    },
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    draggable: true,
    selectable: true,
    deletable: true
  }) as unknown as NodeProps<Node<NodeData>>;

const renderComment = (properties: Record<string, unknown>) => (
  <ThemeProvider theme={mockTheme}>
    <CommentNode {...nodeProps(properties)} />
  </ThemeProvider>
);

describe("CommentNode", () => {
  beforeEach(() => {
    updateNodeData.mockClear();
  });

  it("shows comment text written from outside the editor, such as an undo", () => {
    const { rerender } = render(renderComment({ comment: "first" }));
    expect(screen.getByTestId("editor-text")).toHaveTextContent("first");

    rerender(renderComment({ comment: "second" }));

    expect(screen.getByTestId("editor-text")).toHaveTextContent("second");
  });

  it("follows the color in node data", () => {
    const { rerender } = render(
      renderComment({ comment: "", comment_color: "#ff0000" })
    );
    expect(screen.getByTestId("color-picker")).toHaveAttribute(
      "data-color",
      "#ff0000"
    );

    rerender(renderComment({ comment: "", comment_color: "#00ff00" }));

    expect(screen.getByTestId("color-picker")).toHaveAttribute(
      "data-color",
      "#00ff00"
    );
  });

  it("writes a pending edit when the node unmounts", () => {
    jest.useFakeTimers();
    try {
      const { unmount } = render(renderComment({ comment: "first" }));
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "type" }));
      });
      expect(updateNodeData).not.toHaveBeenCalled();

      unmount();

      expect(updateNodeData).toHaveBeenCalledTimes(1);
      const [, data] = updateNodeData.mock.calls[0];
      expect(JSON.stringify(data.properties.comment)).toContain("typed");

      jest.advanceTimersByTime(1000);
      expect(updateNodeData).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not rewrite or reset the editor when its own write comes back", () => {
    jest.useFakeTimers();
    try {
      const { rerender } = render(renderComment({ comment: "first" }));
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "type" }));
        jest.advanceTimersByTime(500);
      });
      expect(updateNodeData).toHaveBeenCalledTimes(1);
      const [, data] = updateNodeData.mock.calls[0];

      rerender(renderComment({ comment: data.properties.comment }));
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByTestId("editor-text")).toHaveTextContent("typed");
      expect(updateNodeData).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
