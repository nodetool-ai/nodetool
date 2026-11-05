import { act, renderHook } from "@testing-library/react";
import type { editor } from "monaco-editor";
import { stub } from "../../../test-utils/doubles";
import { useMonacoHistory } from "../documentBarParts";

function event<T>(value: T) {
  const listeners = new Set<(event: T) => void>();
  return {
    subscribe: (listener: (event: T) => void) => {
      listeners.add(listener);
      return {
        dispose: () => {
          listeners.delete(listener);
        }
      };
    },
    fire: () => {
      for (const listener of listeners) {
        listener(value);
      }
    },
    listeners
  };
}

function model() {
  let past = 0;
  let future = 0;
  let version = 1;
  let alternative = 1;
  return {
    value: stub<editor.ITextModel>({
      canUndo: () => past > 0,
      canRedo: () => future > 0,
      getVersionId: () => version,
      getAlternativeVersionId: () => alternative
    }),
    edit: () => {
      past++;
      future = 0;
      alternative = ++version;
    },
    undo: () => {
      if (past) {
        past--;
        future++;
        version++;
        alternative--;
      }
    },
    redo: () => {
      if (future) {
        past++;
        future--;
        version++;
        alternative++;
      }
    }
  };
}

function editorDouble(initial = model()) {
  let current: ReturnType<typeof model> | null = initial;
  const content = event(stub<editor.IModelContentChangedEvent>({}));
  const changedModel = event(stub<editor.IModelChangedEvent>({}));
  const disposed = event(undefined);
  const trigger = jest.fn((_source: string, action: string) => {
    if (action === "undo") {
      current?.undo();
    }
    if (action === "redo") {
      current?.redo();
    }
    content.fire();
  });
  return {
    value: stub<editor.IStandaloneCodeEditor>({
      getModel: () => current?.value ?? null,
      onDidChangeModelContent: content.subscribe,
      onDidChangeModel: changedModel.subscribe,
      onDidDispose: disposed.subscribe,
      trigger
    }),
    edit: () => {
      current?.edit();
      content.fire();
    },
    switchModel: (next: ReturnType<typeof model> | null) => {
      current = next;
      changedModel.fire();
    },
    content,
    changedModel,
    disposed,
    trigger
  };
}

describe("useMonacoHistory", () => {
  it("tracks edits, toolbar undo/redo, keyboard undo, and a new edit clearing redo", () => {
    const editor = editorDouble();
    const { result } = renderHook(() => useMonacoHistory());
    act(() => result.current.onEditorMount(editor.value));
    expect(result.current).toMatchObject({ canUndo: false, canRedo: false });
    act(() => editor.edit());
    expect(result.current).toMatchObject({ canUndo: true, canRedo: false });
    act(() => result.current.undo());
    expect(editor.trigger).toHaveBeenLastCalledWith("toolbar", "undo", null);
    expect(result.current).toMatchObject({ canUndo: false, canRedo: true });
    act(() => result.current.redo());
    expect(editor.trigger).toHaveBeenLastCalledWith("toolbar", "redo", null);
    expect(result.current).toMatchObject({ canUndo: true, canRedo: false });
    act(() => editor.value.trigger("keyboard", "undo", null));
    expect(result.current).toMatchObject({ canUndo: false, canRedo: true });
    act(() => editor.edit());
    expect(result.current).toMatchObject({ canUndo: true, canRedo: false });
  });

  it("reads existing history on mount and when switching or detaching documents", () => {
    const first = model();
    first.edit();
    const editor = editorDouble(first);
    const { result } = renderHook(() => useMonacoHistory());
    act(() => result.current.onEditorMount(editor.value));
    expect(result.current.canUndo).toBe(true);
    const second = model();
    second.edit();
    second.undo();
    act(() => editor.switchModel(second));
    expect(result.current).toMatchObject({ canUndo: false, canRedo: true });
    act(() => editor.switchModel(null));
    expect(result.current).toMatchObject({ canUndo: false, canRedo: false });
    act(() => editor.switchModel(first));
    expect(result.current).toMatchObject({ canUndo: true, canRedo: false });
  });

  it("releases subscriptions on replacement, disposal, and hook unmount", () => {
    const first = editorDouble();
    const second = editorDouble();
    const { result, unmount } = renderHook(() => useMonacoHistory());
    act(() => result.current.onEditorMount(first.value));
    act(() => result.current.onEditorMount(second.value));
    expect(first.content.listeners.size).toBe(0);
    expect(first.changedModel.listeners.size).toBe(0);
    expect(first.disposed.listeners.size).toBe(0);
    act(() => second.edit());
    act(() => second.disposed.fire());
    expect(result.current.editorRef.current).toBeNull();
    expect(result.current).toMatchObject({ canUndo: false, canRedo: false });
    expect(second.content.listeners.size).toBe(0);
    expect(second.changedModel.listeners.size).toBe(0);
    expect(second.disposed.listeners.size).toBe(0);
    act(() => result.current.undo());
    expect(second.trigger).not.toHaveBeenCalled();
    act(() => result.current.onEditorMount(first.value));
    unmount();
    expect(first.content.listeners.size).toBe(0);
    expect(first.changedModel.listeners.size).toBe(0);
    expect(first.disposed.listeners.size).toBe(0);
    expect(result.current.editorRef.current).toBeNull();
  });
});
