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
  _editorParams: any
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

  editor.addEventListener("change", onChange);
  editor.addEventListener("blur", onChange);
  editor.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      onChange();
    } else if (e.key === "Escape") {
      cancel(null);
    }
  });

  return editor;
};

export const floatEditor: Editor = (
  cell: CellComponent,
  onRendered: EmptyCallback,
  success: ValueBooleanCallback,
  cancel: ValueVoidCallback,
  _editorParams: any
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

  editor.addEventListener("change", onChange);
  editor.addEventListener("blur", onChange);
  editor.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      onChange();
    } else if (e.key === "Escape") {
      cancel(null);
    }
  });

  return editor;
};

const datePickerRoots = new Map<HTMLElement, { root: import("react-dom/client").Root }>();

export const datetimeEditor: Editor = (
  cell: CellComponent,
  onRendered: EmptyCallback,
  success: ValueBooleanCallback,
  cancel: ValueVoidCallback,
  _editorParams: any
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
      const entry = datePickerRoots.get(editor);
      if (entry) {
        entry.root.unmount();
        datePickerRoots.delete(editor);
      }
    };
  });

  editor.addEventListener("blur", () => cancel(null));

  return editor;
};
