import { JSONSchema, Workflow } from "./types/workflow";

interface FileInputValue {
  uri: string;
  type: string;
}

function fileToDataURI(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

async function getInputValues(
  schema: JSONSchema
): Promise<Record<string, any>> {
  const values: Record<string, any> = {};

  if (!schema.properties) return values;

  for (const [key, value] of Object.entries(schema.properties)) {
    const input = document.getElementById(key);
    if (!input) continue;

    if (input instanceof HTMLInputElement) {
      switch (input.type) {
        case "checkbox":
          values[key] = input.checked;
          break;
        case "range":
        case "number":
          values[key] = parseFloat(input.value);
          break;
        case "file":
          const file = input.files?.[0];
          if (file && value.properties?.type?.enum?.[0]) {
            values[key] = {
              uri: `file://${file.path}`,
              type: value.properties.type.enum[0],
            };
          }
          break;
        case "text":
          values[key] = input.value;
          break;
      }
    } else if (input instanceof HTMLTextAreaElement) {
      values[key] = input.value;
    } else if (input instanceof HTMLSelectElement) {
      values[key] = input.value;
    } else {
      throw new Error(`Unsupported input type: ${input}`);
    }
  }
  return values;
}

export function generateInputFields(
  schema: JSONSchema,
  container: HTMLElement,
  onSubmit: (params: Record<string, any>) => Promise<void>
): void {
  container.innerHTML = "";
  container.className = "form-container";

  if (!schema?.properties || Object.keys(schema.properties).length === 0) {
    return;
  }

  const autoSubmit =
    Object.keys(schema.properties).length === 1 &&
    schema.properties[Object.keys(schema.properties)[0]].type !== "string";

  const onChangeField = () => {
    if (autoSubmit) {
      getInputValues(schema).then(onSubmit);
    }
  };

  for (const [key, value] of Object.entries(schema.properties)) {
    const formGroup = createFormGroup(key, value, onChangeField);
    container.appendChild(formGroup);
  }

  const submitButton = createSubmitButton(() =>
    getInputValues(schema).then(onSubmit)
  );
  container.appendChild(submitButton);
}

function createFormGroup(
  key: string,
  value: JSONSchema,
  onChange: () => void
): HTMLDivElement {
  const formGroup = document.createElement("div");
  formGroup.className = "form-group";

  const label = document.createElement("label");
  label.textContent = value.label || key;
  label.setAttribute("for", key);

  const input = createInput(key, value, onChange);
  formGroup.appendChild(label);
  formGroup.appendChild(input);
  return formGroup;
}

function createInput(
  key: string,
  value: JSONSchema,
  onChange: () => void
): HTMLElement {
  if (value.type === "string") {
    return createTextArea(key, onChange);
  } else if (value.type === "integer" || value.type === "number") {
    return value.minimum !== undefined && value.maximum !== undefined
      ? createRangeInput(key, value, onChange)
      : createNumberInput(key, value, onChange);
  } else if (value.type === "boolean") {
    return createCheckbox(key, onChange);
  } else if (value.type === "object" && value.properties?.uri) {
    return createFileInput(key, onChange);
  } else if (value.type === "enum") {
    return createEnumInput(key, value, onChange);
  }
  return createTextArea(key, onChange);
}

function createTextArea(
  key: string,
  onChange: () => void
): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.id = key;
  textarea.className = "form-control";
  textarea.addEventListener("change", onChange);
  return textarea;
}

function createRangeInput(
  key: string,
  value: JSONSchema,
  onChange: () => void
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "range";
  input.id = key;
  input.className = "form-control";
  input.min = String(value.minimum ?? 0);
  input.max = String(value.maximum ?? 100);
  input.step = determineStepSize(value.minimum, value.maximum);
  input.addEventListener("change", onChange);
  return input;
}

function createNumberInput(
  key: string,
  value: JSONSchema,
  onChange: () => void
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.id = key;
  input.className = "form-control";
  if (value.minimum !== undefined) input.min = String(value.minimum);
  if (value.maximum !== undefined) input.max = String(value.maximum);
  input.addEventListener("change", onChange);
  return input;
}

function createCheckbox(key: string, onChange: () => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = key;
  input.className = "form-check-input";
  input.addEventListener("change", onChange);
  return input;
}

function createFileInput(key: string, onChange: () => void): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "file-drop-area";

  const input = document.createElement("input");
  input.type = "file";
  input.id = key;
  input.className = "file-input";

  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone";
  dropZone.innerHTML = `
    <div class="drop-zone-text">
      Drop files here or click to upload
      <span class="selected-file"></span>
    </div>
  `;

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer?.files[0];
    if (file) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      updateFileName(dropZone, file.name);
      onChange();
    }
  });

  dropZone.addEventListener("click", () => {
    input.click();
  });

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) {
      updateFileName(dropZone, file.name);
      onChange();
    }
  });

  wrapper.appendChild(input);
  wrapper.appendChild(dropZone);
  return wrapper;
}

function updateFileName(dropZone: HTMLElement, fileName: string): void {
  const fileNameElement = dropZone.querySelector(".selected-file");
  if (fileNameElement) {
    fileNameElement.textContent = `Selected: ${fileName}`;
  }
}

function createSubmitButton(onSubmit: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Submit";
  button.className = "submit-button";
  button.addEventListener("click", onSubmit);
  return button;
}

function determineStepSize(
  min: number | undefined,
  max: number | undefined
): string {
  if (min === undefined || max === undefined) return "1";
  const range = max - min;
  if (range <= 1) return "0.1";
  if (range <= 10) return "0.5";
  if (range <= 100) return "1";
  return Math.pow(10, Math.floor(Math.log10(range) - 2)).toString();
}

export function disableInputFields(container: HTMLElement): void {
  const inputFields = container.querySelectorAll("input, textarea, select");
  inputFields.forEach((input) => {
    // @ts-ignore
    input.disabled = true;
  });
}

export function enableInputFields(container: HTMLElement): void {
  const inputFields = container.querySelectorAll("input, textarea, select");
  inputFields.forEach((input) => {
    // @ts-ignore
    input.disabled = false;
  });
}

function createEnumInput(
  key: string,
  value: JSONSchema,
  onChange: () => void
): HTMLSelectElement {
  const select = document.createElement("select");
  select.id = key;
  select.className = "form-control";

  if (!value.required) {
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "-- Select an option --";
    select.appendChild(defaultOption);
  }

  if (Array.isArray(value.enum)) {
    value.enum.forEach((enumValue) => {
      const option = document.createElement("option");
      option.value = enumValue;
      option.textContent = enumValue;
      select.appendChild(option);
    });
  }

  select.addEventListener("change", onChange);
  return select;
}
