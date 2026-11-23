import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_LOW,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  type LexicalEditor
} from "lexical";
import { useEffect } from "react";

import mockTheme from "../../../__mocks__/themeMock";
import { DOCUMENT_NODES } from "../markdownBlockCodec";
import { DOCUMENT_THEME } from "../documentEditorStyles";
import { indentSelection, outdentSelection } from "../documentCommands";
import DocumentToolbar from "../DocumentToolbar";

function CommandSpy({
  onIndent,
  onOutdent,
  onEditor
}: {
  onIndent: () => void;
  onOutdent: () => void;
  onEditor?: (editor: LexicalEditor) => void;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onEditor?.(editor);
    const unregisterIndent = editor.registerCommand(
      INDENT_CONTENT_COMMAND,
      () => {
        onIndent();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
    const unregisterOutdent = editor.registerCommand(
      OUTDENT_CONTENT_COMMAND,
      () => {
        onOutdent();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
    return () => {
      unregisterIndent();
      unregisterOutdent();
    };
  }, [editor, onEditor, onIndent, onOutdent]);
  return null;
}

describe("DocumentToolbar list indentation controls", () => {
  it("dispatches INDENT_CONTENT_COMMAND and OUTDENT_CONTENT_COMMAND from toolbar buttons and helpers", async () => {
    const user = userEvent.setup();
    const onIndent = jest.fn();
    const onOutdent = jest.fn();
    let editorRef: LexicalEditor | null = null;

    render(
      <ThemeProvider theme={mockTheme}>
        <LexicalComposer
          initialConfig={{
            namespace: "toolbar-test",
            nodes: [...DOCUMENT_NODES],
            theme: DOCUMENT_THEME,
            onError: (error) => {
              throw error;
            }
          }}
        >
          <DocumentToolbar onLink={jest.fn()} onEmbed={jest.fn()} />
          <CommandSpy
            onIndent={onIndent}
            onOutdent={onOutdent}
            onEditor={(editor) => {
              editorRef = editor;
            }}
          />
        </LexicalComposer>
      </ThemeProvider>
    );

    const outdentButton = screen.getByRole("button", {
      name: "Decrease list indentation"
    });
    const indentButton = screen.getByRole("button", {
      name: "Increase list indentation"
    });

    await user.click(indentButton);
    await user.click(outdentButton);

    expect(onIndent).toHaveBeenCalledTimes(1);
    expect(onOutdent).toHaveBeenCalledTimes(1);

    expect(editorRef).not.toBeNull();
    indentSelection(editorRef!);
    outdentSelection(editorRef!);
    expect(onIndent).toHaveBeenCalledTimes(2);
    expect(onOutdent).toHaveBeenCalledTimes(2);
  });
});
