import {
  Editor,
  CellComponent,
  EmptyCallback,
  ValueBooleanCallback,
  ValueVoidCallback
} from "tabulator-tables";
import { createRoot } from "react-dom/client";
import CustomDatePicker from "../../inputs/DatePicker";
import { isValid, parseISO } from "date-fns";

export const integerEditor: Editor = (
  cell: CellComponent,
  onRendered: EmptyCallback,
  success: ValueBooleanCallback,
  cancel: ValueVoidCallback,
  _editorParams: Record<string, unknown>
) => {
  const editor = document.createElement("input");
  editor.setAttribute("type", "text");
  editor.style.width = "100%";
  editor.style.boxSizing = "border-box";
  editor.value = cell.getValue();

  function onChange() {
    const value = parseInt(editor.value, 10);
    if (!isNaN(value)) {
      success(value);
    } else {
      cancel(null);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      onChange();
    } else if (e.key === "Escape") {
      cancel(null);
    }
  }

  editor.addEventListener("change", onChange);
  editor.addEventListener("blur", onChange);
  editor.addEventListener("keydown", onKeyDown);

  // Register cleanup function via onRendered callback
  onRendered(() => {
    return () => {
      editor.removeEventListener("change", onChange);
      editor.removeEventListener("blur", onChange);
      editor.removeEventListener("keydown", onKeyDown);
    };
  });

  return editor;
};

export const floatEditor: Editor = (
  cell: CellComponent,
  onRendered: EmptyCallback,
  success: ValueBooleanCallback,
  cancel: ValueVoidCallback,
  _editorParams: Record<string, unknown>
) => {
  const editor = document.createElement("input");
  editor.setAttribute("type", "text");
  editor.style.width = "100%";
  editor.style.boxSizing = "border-box";
  editor.value = cell.getValue();

  function onChange() {
    const value = parseFloat(editor.value);
    if (!isNaN(value)) {
      success(value);
    } else {
      cancel(null);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      onChange();
    } else if (e.key === "Escape") {
      cancel(null);
    }
  }

  editor.addEventListener("change", onChange);
  editor.addEventListener("blur", onChange);
  editor.addEventListener("keydown", onKeyDown);

  // Register cleanup function via onRendered callback
  onRendered(() => {
    return () => {
      editor.removeEventListener("change", onChange);
      editor.removeEventListener("blur", onChange);
      editor.removeEventListener("keydown", onKeyDown);
    };
  });

  return editor;
};

const datePickerRoots = new Map<HTMLElement, { root: import("react-dom/client").Root }>();

export const datetimeEditor: Editor = (
  cell: CellComponent,
  onRendered: EmptyCallback,
  success: ValueBooleanCallback,
  cancel: ValueVoidCallback,
  _editorParams: Record<string, unknown>
) => {
  const editor = document.createElement("div");
  editor.style.width = "100%";
  editor.style.boxSizing = "border-box";

  const handleDateChange = (date: string) => {
    const parsedDate = parseISO(date);
    if (isValid(parsedDate)) {
      success(parsedDate.toISOString());
    } else {
      cancel(null);
    }
  };

  const onBlur = () => cancel(null);
  editor.addEventListener("blur", onBlur);

  onRendered(() => {
    const root = createRoot(editor);
    datePickerRoots.set(editor, { root });
    root.render(
      <CustomDatePicker
        value={cell.getValue() as string}
        onChange={handleDateChange}
      />
    );

    return () => {
      // Cleanup React root
      const entry = datePickerRoots.get(editor);
      if (entry) {
        entry.root.unmount();
        datePickerRoots.delete(editor);
      }
      // Cleanup blur event listener
      editor.removeEventListener("blur", onBlur);
    };
  });

  return editor;
};
