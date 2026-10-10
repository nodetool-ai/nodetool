import React, { useEffect } from "react";
import { act, render } from "@testing-library/react";
import { withTypingSafeValue } from "../withTypingSafeValue";

/** A stand-in for Monaco: holds text and reports edits through onChange. */
class FakeEditor {
  text: string;
  listener: ((value: string) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
  getValue() {
    return this.text;
  }
  getModel() {
    return { getFullModelRange: () => ({}) };
  }
  getOption() {
    return false;
  }
  setValue(value: string) {
    this.text = value;
    this.listener?.(value);
  }
  executeEdits(_source: string, edits: { text: string }[]) {
    this.text = edits[0].text;
    this.listener?.(this.text);
  }
  pushUndoStop() {}
  /** A keystroke typed by the user. */
  type(key: string) {
    this.text += key;
    this.listener?.(this.text);
  }
}

let editor: FakeEditor;

const LibraryEditor = ({
  defaultValue,
  onChange,
  onMount
}: {
  defaultValue?: string;
  onChange?: (value?: string) => void;
  onMount?: (editor: never, monaco: never) => void;
}) => {
  useEffect(() => {
    editor = new FakeEditor(defaultValue ?? "");
    editor.listener = (value) => onChange?.(value);
    onMount?.(editor as never, { editor: { EditorOption: {} } } as never);
    // Mount once, as Monaco does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const Editor = withTypingSafeValue(LibraryEditor);

describe("withTypingSafeValue", () => {
  it("keeps keystrokes the parent has not rendered back yet", () => {
    const { rerender } = render(<Editor value="" />);

    act(() => {
      editor.type("H");
      editor.type("e");
    });
    // The parent renders the first keystroke only after the second one landed.
    rerender(<Editor value="H" />);
    rerender(<Editor value="He" />);

    expect(editor.getValue()).toBe("He");
  });

  it("applies a value that did not come from the editor", () => {
    const { rerender } = render(<Editor value="draft" />);

    rerender(<Editor value="loaded from disk" />);

    expect(editor.getValue()).toBe("loaded from disk");
  });

  it("does not report its own replacement as a user edit", () => {
    const onChange = jest.fn();
    const { rerender } = render(<Editor value="a" onChange={onChange} />);

    rerender(<Editor value="b" onChange={onChange} />);

    expect(onChange).not.toHaveBeenCalled();
  });
});
