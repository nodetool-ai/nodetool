/**
 * @typedef {Object} JSONSchema
 * @property {string} type - The data type (string, number, boolean, object, array, null)
 * @property {string} [title] - Human-readable title
 * @property {string} [description] - Human-readable description
 * @property {string} [format] - Format of the input
 * @property {*} [default] - Default value for the schema
 * @property {boolean} [required] - Whether the property is required
 * @property {number} [minimum] - Minimum value for numbers
 * @property {number} [maximum] - Maximum value for numbers
 * @property {number}j [minLength] - Minimum length for strings
 * @property {number} [maxLength] - Maximum length for strings
 * @property {string} [pattern] - Regular expression pattern for strings
 * @property {string[]} [enum] - Array of allowed values
 * @property {JSONSchema[]} [anyOf] - Array of possible schemas, any of which can validate
 * @property {JSONSchema[]} [allOf] - Array of schemas, all of which must validate
 * @property {JSONSchema[]} [oneOf] - Array of schemas, exactly one of which must validate
 * @property {JSONSchema} [not] - Schema that must not validate
 * @property {Object.<string, JSONSchema>} [properties] - Object properties when type is 'object'
 * @property {JSONSchema} [items] - Schema for array items when type is 'array'
 * @property {string[]} [required] - Array of required property names when type is 'object'
 * @property {number} [minItems] - Minimum number of items when type is 'array'
 * @property {number} [maxItems] - Maximum number of items when type is 'array'
 * @property {boolean} [uniqueItems] - Whether array items must be unique
 * @property {Object.<string, JSONSchema>} [definitions] - Reusable schema definitions
 * @property {string} [$ref] - Reference to another schema definition
 */

/**
 * @typedef {Object} Workflow
 * @property {string} id - Unique identifier of the workflow
 * @property {string} name - Display name of the workflow
 * @property {string} description - Description of the workflow
 * @property {string} created_at - Date and time the workflow was created
 * @property {string} updated_at - Date and time the workflow was last updated
 * @property {string} tags - Tags of the workflow
 * @property {string} thumbnail - thumbnail ID
 * @property {string} thumbnail_url - URL of the workflow thumbnail
 * @property {JSONSchema} input_schema - Input schema of the workflow
 * @property {JSONSchema} output_schema - Output schema of the workflow
 */

/**
 * Generates input fields based on a JSON schema
 * @param {JSONSchema} schema - The JSON schema defining the input fields
 * @returns {Object} The input values
 */
function getInputValues(schema) {
  const values = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    const input = document.getElementById(key);
    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      values[key] = input.checked;
    } else if (input instanceof HTMLInputElement && input.type === "range") {
      values[key] = parseFloat(input.value);
    } else if (input instanceof HTMLInputElement && input.type === "number") {
      values[key] = parseFloat(input.value);
    } else if (input instanceof HTMLInputElement) {
      values[key] = input.value;
    } else if (input instanceof HTMLTextAreaElement) {
      values[key] = input.value;
    } else {
      throw new Error(`Unsupported input type: ${input}`);
    }
  }
  return values;
}
/**
 * Generates input fields based on a JSON schema
 * @param {JSONSchema} schema
 * @param {HTMLElement} container
 * @param {(params: Object) => Promise<void>} onSubmit
 */
export function generateInputFields(schema, container, onSubmit) {
  container.innerHTML = "";
  container.className = "form-container";

  if (!schema?.properties || Object.keys(schema.properties).length === 0) {
    return;
  }

  for (const [key, value] of Object.entries(schema.properties)) {
    const formGroup = createFormGroup(key, value);
    container.appendChild(formGroup);
  }

  const submitButton = createSubmitButton(() =>
    onSubmit(getInputValues(schema))
  );
  container.appendChild(submitButton);
}

/**
 * Creates a form group with label and input
 * @param {string} key
 * @param {JSONSchema} value
 */
function createFormGroup(key, value) {
  const formGroup = document.createElement("div");
  formGroup.className = "form-group";

  const label = document.createElement("label");
  label.textContent = value.title || key;
  label.setAttribute("for", key);

  const input = createInput(key, value);

  formGroup.appendChild(label);
  formGroup.appendChild(input);
  return formGroup;
}

/**
 * Creates an appropriate input element based on schema
 * @param {string} key
 * @param {JSONSchema} value
 */
function createInput(key, value) {
  if (value.type === "string") {
    return createTextArea(key);
  } else if (value.type === "integer" || value.type === "number") {
    return value.minimum !== undefined && value.maximum !== undefined
      ? createRangeInput(key, value)
      : createNumberInput(key, value);
  } else if (value.type === "boolean") {
    return createCheckbox(key);
  }
  return createTextArea(key);
}

/**
 * Creates a textarea input element
 * @param {string} key
 * @returns {HTMLTextAreaElement}
 */
function createTextArea(key) {
  const textarea = document.createElement("textarea");
  textarea.id = key;
  textarea.className = "form-control";
  return textarea;
}

/**
 * Creates a range input element
 * @param {string} key
 * @param {JSONSchema} value
 * @returns {HTMLInputElement}
 */
function createRangeInput(key, value) {
  const input = document.createElement("input");
  input.type = "range";
  input.id = key;
  input.className = "form-control";
  input.min = String(value.minimum ?? 0);
  input.max = String(value.maximum ?? 100);
  input.step = determineStepSize(value.minimum, value.maximum);
  return input;
}

/**
 * Creates a number input element
 * @param {string} key
 * @param {JSONSchema} value
 * @returns {HTMLInputElement}
 */
function createNumberInput(key, value) {
  const input = document.createElement("input");
  input.type = "number";
  input.id = key;
  input.className = "form-control";
  if (value.minimum !== undefined) input.min = String(value.minimum);
  if (value.maximum !== undefined) input.max = String(value.maximum);
  return input;
}

/**
 * Creates a checkbox input element
 * @param {string} key
 * @returns {HTMLInputElement}
 */
function createCheckbox(key) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = key;
  input.className = "form-check-input";
  return input;
}

/**
 * Creates a submit button
 * @param {() => void} onSubmit
 * @returns {HTMLButtonElement}
 */
function createSubmitButton(onSubmit) {
  const button = document.createElement("button");
  button.textContent = "Submit";
  button.className = "submit-button";
  button.addEventListener("click", onSubmit);
  return button;
}

/**
 * Determines the step size for range inputs based on min and max values
 * @param {number | undefined} min
 * @param {number | undefined} max
 * @returns {string}
 */
function determineStepSize(min, max) {
  if (min === undefined || max === undefined) return "1";
  const range = max - min;
  if (range <= 1) return "0.1";
  if (range <= 10) return "0.5";
  if (range <= 100) return "1";
  return Math.pow(10, Math.floor(Math.log10(range) - 2)).toString();
}

/**
 * Disables all input fields
 * @param {HTMLElement} container
 */
export function disableInputFields(container) {
  const inputFields = container.querySelectorAll("input, textarea");
  inputFields.forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.disabled = true;
    }
  });
}

/**
 * Enables all input fields
 * @param {HTMLElement} container
 */
export function enableInputFields(container) {
  const inputFields = container.querySelectorAll("input, textarea");
  inputFields.forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.disabled = false;
    }
  });
}
