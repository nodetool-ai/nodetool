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

const WORKER_URL = "ws://127.0.0.1:8000/predict";

/**
 * Class to handle workflow execution and WebSocket communication
 */
class WorkflowRunner {
  /**
   * Creates a new WorkflowRunner instance
   * @param {Object} config - Configuration object
   * @param {string} config.token - Authentication token
   */
  constructor(config) {
    this.token = config.token;
    this.socket = null;
  }

  /**
   * Establishes WebSocket connection
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(WORKER_URL);
      this.socket.onopen = () => {
        console.log("WebSocket connected");
        resolve();
      };
      this.socket.onerror = reject;
    });
  }

  /**
   * Runs the specified workflow
   * @param {string} workflowId - ID of the workflow to run
   * @param {Object} params - Parameters for the workflow
   * @returns {Promise<Object>} The workflow results
   */
  async run(workflowId, params) {
    const loaderContainer = document.querySelector(".loader-container");
    if (loaderContainer instanceof HTMLElement) {
      loaderContainer.style.display = "flex";
    }

    await this.connect();

    const request = {
      type: "run_job_request",
      workflow_id: workflowId,
      job_type: "workflow",
      auth_token: this.token,
      params: params,
    };

    this.socket.send(
      // @ts-ignore
      msgpack.encode({
        command: "run_job",
        data: request,
      })
    );

    return new Promise((resolve, reject) => {
      this.socket.onmessage = async (event) => {
        const arrayBuffer = await event.data.arrayBuffer();
        // @ts-ignore
        const data = msgpack.decode(new Uint8Array(arrayBuffer));

        console.log(data);

        if (data.type === "job_update") {
          if (data.status === "completed") {
            resolve(data.result);
          } else if (data.status === "failed") {
            reject(new Error(data.error));
          }
        } else if (data.type === "node_progress") {
          updateProgress((data.progress / data.total) * 100);
        }
      };
    });
  }
}

/**
 * Updates the progress bar and percentage text
 * @param {number} percentage - The progress percentage (0-100)
 * @returns {void}
 */
function updateProgress(percentage) {
  const progressContainer = document.querySelector(".progress-container");
  if (progressContainer instanceof HTMLElement) {
    progressContainer.style.display = "block";
    const progressFill = progressContainer.querySelector(".progress-fill");
    if (progressFill instanceof HTMLElement) {
      progressFill.style.width = `${percentage}%`;
    }
    const progressText = progressContainer.querySelector("#progressText");
    if (progressText instanceof HTMLElement) {
      progressText.textContent = `${Math.round(percentage)}%`;
    }
  }
}

/**
 * Checks if the schema has input fields
 * @param {JSONSchema} schema - The JSON schema to check
 * @returns {boolean} Whether the schema has input fields
 */
function hasInputFields(schema) {
  return schema.properties && Object.keys(schema.properties).length > 0;
}

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
 * @param {JSONSchema} schema - The JSON schema defining the input fields
 * @param {HTMLElement} container - The container element to append the fields to
 * @param {(message: string) => Promise<void>} onSubmit - The function to call when the submit button is clicked
 * @returns {void}
 */
function generateInputFields(schema, container, onSubmit) {
  container.innerHTML = "";
  container.className = "form-container";

  if (
    !schema ||
    !schema.properties ||
    Object.keys(schema.properties).length === 0
  ) {
    return;
  }

  for (const [key, value] of Object.entries(schema.properties)) {
    const formGroup = document.createElement("div");
    formGroup.className = "form-group";

    const label = document.createElement("label");
    label.textContent = value.title || key;
    label.setAttribute("for", key);

    let input;
    if (value.type === "string") {
      input = document.createElement("textarea");
      input.rows = 3;
    } else if (value.type === "integer" || value.type === "number") {
      if (value.minimum !== undefined && value.maximum !== undefined) {
        const wrapper = document.createElement("div");
        wrapper.className = "range-wrapper";

        const rangeInput = document.createElement("input");
        rangeInput.type = "range";
        rangeInput.min = value.minimum.toString();
        rangeInput.max = value.maximum.toString();
        rangeInput.step = determineStepSize(
          value.minimum,
          value.maximum,
          value.type
        );
        rangeInput.value =
          value.default ||
          (
            (parseFloat(rangeInput.max) + parseFloat(rangeInput.min)) /
            2
          ).toString();

        const numberInput = document.createElement("input");
        numberInput.type = "number";
        numberInput.min = value.minimum.toString();
        numberInput.max = value.maximum.toString();
        numberInput.step = rangeInput.step;
        numberInput.value = rangeInput.value;
        rangeInput.addEventListener("input", (event) => {
          if (event.target instanceof HTMLInputElement) {
            numberInput.value = event.target.value;
            console.log("Slider value changed:", event.target.value);
          }
        });

        numberInput.addEventListener("input", (event) => {
          if (event.target instanceof HTMLInputElement) {
            rangeInput.value = event.target.value;
            console.log("Number input value changed:", event.target.value);
          }
        });

        const sliderWrapper = document.createElement("div");
        sliderWrapper.className = "slider-wrapper";

        const min = document.createElement("span");
        min.textContent = value.minimum.toString();
        min.className = "range-min";
        const max = document.createElement("span");
        max.textContent = value.maximum.toString();
        max.className = "range-max";

        sliderWrapper.appendChild(min);
        sliderWrapper.appendChild(rangeInput);
        sliderWrapper.appendChild(max);

        wrapper.appendChild(sliderWrapper);
        wrapper.appendChild(numberInput);
        input = wrapper;
      } else {
        input = document.createElement("input");
        input.type = "number";
        if (value.type === "integer") {
          input.step = "1";
        }
      }
    } else if (value.type === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox";
    } else {
      input = document.createElement("textarea");
      input.rows = 3;
    }

    if (input.tagName !== "DIV") {
      if (input instanceof HTMLInputElement) {
        input.id = key;
        input.name = key;
      } else if (input instanceof HTMLTextAreaElement) {
        input.id = key;
      }
    } else {
      if (input.querySelector("input") instanceof HTMLInputElement) {
        input.querySelector("input").id = key;
        input.querySelector("input").name = key;
      }
    }

    formGroup.appendChild(label);
    formGroup.appendChild(input);
    container.appendChild(formGroup);
  }

  // Update submit button with new styling
  const submitButton = document.createElement("button");
  submitButton.textContent = "Run Workflow";
  submitButton.className = "submit-button";
  submitButton.id = "submit-button";
  submitButton.addEventListener("click", () =>
    onSubmit(getInputValues(schema))
  );
  container.appendChild(submitButton);
}

/**
 * Determines the step size for number inputs based on the range and type
 * @param {number} min - The minimum value of the range
 * @param {number} max - The maximum value of the range
 * @param {string} type - The data type ('integer' or 'number')
 * @returns {string} The step size as a string
 */
function determineStepSize(min, max, type) {
  const range = max - min;
  if (type === "integer") {
    return "1";
  } else {
    if (range <= 1) {
      return "0.01";
    } else if (range <= 10) {
      return "0.1";
    } else if (range <= 100) {
      return "1";
    } else {
      return Math.pow(10, Math.floor(Math.log10(range)) - 2).toString();
    }
  }
}

/**
 * Displays the workflow results in the UI
 * @param {Object} results - The results object from the workflow
 * @returns {void}
 */
function displayResults(results) {
  const container = document.getElementById("results");

  const loaderContainer = document.querySelector(".loader-container");
  if (loaderContainer instanceof HTMLElement) {
    loaderContainer.style.display = "none";
  }
  const progressContainer = document.querySelector(".progress-container");
  if (progressContainer instanceof HTMLElement) {
    progressContainer.style.display = "none";
  }
  const resultsContainer = document.querySelector(".results-container");
  if (resultsContainer instanceof HTMLElement) {
    resultsContainer.style.display = "block";
  }

  for (const [key, value] of Object.entries(results)) {
    const field = document.createElement("div");
    field.className = "output-field";

    if (value.type === "image") {
      const img = document.createElement("img");
      const data = new Uint8Array(value.data);
      const blob = new Blob([data], { type: "image/png" });
      img.src = URL.createObjectURL(blob);
      field.appendChild(img);
    } else {
      const pre = document.createElement("pre");
      pre.textContent =
        typeof value === "object"
          ? JSON.stringify(value, null, 2)
          : String(value);
      field.appendChild(pre);
    }

    container.appendChild(field);
  }
}

/**
 * Initializes the workflow runner and sets up event handlers
 * @returns {Promise<void>}
 */
async function init() {
  const outputContainer = document.querySelector(".output-container");
  if (outputContainer instanceof HTMLElement) {
    outputContainer.style.display = "block";
  }

  const chatRunner = new ChatRunner({
    token: "local_token",
  });
  const messagesList = document.querySelector(".messages");
  if (!(messagesList instanceof HTMLUListElement)) {
    throw new Error("Messages list not found");
  }

  chatRunner.onMessage((/** @type {ChatMessage} */ message) => {
    console.log("Chat message received:", message);
    // Remove any loading message
    const loadingMessage = document.querySelector(".message.system.loading");
    if (loadingMessage) {
      loadingMessage.remove();
    }
    if (message.role === "assistant") {
      if (typeof message.content === "string") {
        appendMessage(messagesList, "assistant", message.content);
      } else if (Array.isArray(message.content)) {
        for (const item of message.content) {
          appendMessage(messagesList, "assistant", item);
        }
      } else {
        appendMessage(
          messagesList,
          "assistant",
          JSON.stringify(message.content)
        );
      }
      // Re-enable after a short delay or when response is received
      const textarea = document.querySelector(".chat-input");
      const sendButton = document.querySelector(".chat-send-button");
      if (
        textarea instanceof HTMLTextAreaElement &&
        sendButton instanceof HTMLButtonElement
      ) {
        textarea.disabled = false;
        sendButton.disabled = false;
        textarea.focus();
      }
      // hide loading indicator
      const loaderContainer = document.querySelector(".loader-container");
      if (loaderContainer instanceof HTMLElement) {
        loaderContainer.style.display = "none";
      }
    }
  });

  chatRunner.onProgress((progress, total) => {
    if (total > 0) {
      updateProgress((progress / total) * 100);
    }
  });

  chatRunner.onError((error) => {
    console.error("Chat error:", error);
    // Optionally display error in UI
    appendMessage(messagesList, "system", `Error: ${error}`);
  });

  // Add cleanup handler
  // @ts-ignore
  const cleanup = window.api
    ? // @ts-ignore
      window.api.onCleanup(() => {
        chatRunner.disconnect();
      })
    : () => {};

  // Store cleanup function from workflow listener
  // @ts-ignore
  async function runWorkflow(workflow) {
    try {
      console.log("Workflow received:", workflow);

      if (!workflow) {
        throw new Error("No workflow received");
      }

      if (hasInputFields(workflow.input_schema)) {
        /**
         * @param {string} message - The message to send to the chat runner
         * @returns {Promise<void>}
         */
        const onSubmitChat = async (message) => {
          if (!chatRunner.socket || chatRunner.status === "disconnected") {
            await chatRunner.connect(workflow.id);
          }
          await chatRunner.sendMessage({
            type: "message",
            role: "user",
            content: message,
            workflow_id: workflow.id,
            auth_token: "local_token",
          });
        };

        /**
         * @param {Object} params - The parameters to pass to the workflow
         * @returns {Promise<void>}
         */
        const onSubmitWorkflow = async (params) => {
          // For non-chat workflows, use the regular WorkflowRunner
          const runner = new WorkflowRunner({ token: "local_token" });
          runner
            .run(workflow.id, params)
            .then((results) => {
              displayResults(results);
            })
            .catch((error) => {
              console.error("Workflow error:", error);
            });
        };

        const firstProperty = Object.entries(
          workflow.input_schema.properties
        )[0];
        if (firstProperty && firstProperty[1].format === "chat") {
          generateChatInterface(
            document.querySelector(".chat-view"),
            firstProperty[0],
            onSubmitChat
          );
        } else {
          generateInputFields(
            workflow.input_schema,
            document.getElementById("input-container"),
            onSubmitWorkflow
          );
        }
      } else {
        const runner = new WorkflowRunner({ token: "local_token" });
        runner
          .run(workflow.id, {})
          .then((results) => {
            displayResults(results);
          })
          .catch((error) => {
            console.error("Workflow error:", error);
          });
      }
    } catch (error) {
      console.error("Workflow error:", error);
    }
  }

  // @ts-ignore
  const removeWorkflowListener = window.api
    ? // @ts-ignore
      window.api.onWorkflow(runWorkflow)
    : () => {};

  // Clean up listeners when window is closed
  window.addEventListener("unload", () => {
    cleanup();
    removeWorkflowListener();
    chatRunner.disconnect();
  });

  // Parse workflow ID from URL if present
  const urlParams = new URLSearchParams(window.location.search);
  const workflowId = urlParams.get("workflow_id");

  if (workflowId) {
    fetch(`http://localhost:8000/api/workflows/${workflowId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((workflow) => {
        runWorkflow(workflow);
      })
      .catch((error) => {
        console.error("Error fetching workflow:", error);
      });
  }
}

/**
 * Checks if the workflow is a chat-based workflow
 * @param {JSONSchema} schema - The input schema to check
 * @returns {boolean} Whether this is a chat workflow
 */
function isChatWorkflow(schema) {
  const firstProperty = Object.entries(schema.properties)[0];
  return firstProperty && firstProperty[1].format === "chat";
}

/**
 * @typedef {Object} MessageTextContent
 * @property {'text'} type - Type of message content
 * @property {string} text - The text content
 */

/**
 * @typedef {Object} MessageImageContent
 * @property {'image_url'} type - Type of message content
 * @property {Object} image - The image reference
 */

/**
 * @typedef {Object} MessageAudioContent
 * @property {'audio'} type - Type of message content
 * @property {Object} audio - The audio reference
 */

/**
 * @typedef {Object} MessageVideoContent
 * @property {'video'} type - Type of message content
 * @property {Object} video - The video reference
 */

/** @typedef {MessageTextContent | MessageImageContent | MessageAudioContent | MessageVideoContent} MessageContent */

/**
 * @typedef {Object} ChatMessage
 * @property {string} type - Message type
 * @property {string} role - Role of the message sender (user/assistant)
 * @property {MessageContent | string} content - Content of the message
 * @property {string} workflow_id - ID of the associated workflow
 * @property {string} auth_token - Authentication token
 */

/**
 * Generates a chat interface for workflow interaction
 * @param {HTMLElement} container - The container element to append the chat interface to
 * @param {string} inputKey - The key for the input field
 * @param {(message: string) => Promise<void>} onSubmit - Callback function when a message is submitted
 * @returns {void}
 */
function generateChatInterface(container, inputKey, onSubmit) {
  const chatContainer = document.querySelector(".chat-view");
  const messagesList = document.querySelector(".messages");
  const controlsContainer = document.querySelector(".chat-controls");
  const composeContainer = document.querySelector(".compose-message");
  const textarea = document.querySelector(".chat-input");
  const sendButton = document.querySelector(".chat-send-button");

  if (!(chatContainer instanceof HTMLElement)) {
    throw new Error("Chat container not found");
  }
  if (!(messagesList instanceof HTMLUListElement)) {
    throw new Error("Messages list not found");
  }
  if (!(controlsContainer instanceof HTMLElement)) {
    throw new Error("Controls container not found");
  }
  if (!(composeContainer instanceof HTMLElement)) {
    throw new Error("Compose container not found");
  }
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("Textarea not found");
  }
  if (!(sendButton instanceof HTMLButtonElement)) {
    throw new Error("Send button not found");
  }

  const handleSubmit = () => {
    const message = textarea.value.trim();
    if (message) {
      appendMessage(messagesList, "user", message);
      textarea.value = "";
      adjustTextareaHeight(textarea);
      onSubmit(message);

      // Disable input while processing
      textarea.disabled = true;
      sendButton.disabled = true;

      // Add loading indicator
      const loadingMessage = document.createElement("li");
      loadingMessage.className = "message system loading";
      // Replace text content with animated dots
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement("span");
        dot.className = "dot";
        loadingMessage.appendChild(dot);
      }
      messagesList.appendChild(loadingMessage);
    }
  };

  textarea.addEventListener("input", () => {
    adjustTextareaHeight(textarea);
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  });

  sendButton.addEventListener("click", handleSubmit);
}

/**
 * Adjusts the height of a textarea based on its content
 * @param {HTMLTextAreaElement} textarea - The textarea element to adjust
 * @returns {void}
 */
function adjustTextareaHeight(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

/**
 * Appends a new message to the chat interface
 * @param {HTMLUListElement} messagesList - The messages list element
 * @param {'user' | 'assistant' | 'system'} role - The role of the message sender
 * @param {string | MessageContent} content - The content of the message
 * @returns {void}
 */
function appendMessage(messagesList, role, content) {
  const message = document.createElement("li");
  message.className = `message ${role}`;

  console.log("message", content);

  if (typeof content === "object" && content.type === "image_url") {
    const img = document.createElement("img");
    const blob = new Blob([content.image.data], { type: "image/png" });
    img.src = URL.createObjectURL(blob);
    img.onload = () => URL.revokeObjectURL(img.src); // Clean up the blob URL after image loads
    message.appendChild(img);
  } else if (typeof content === "object" && content.type === "text") {
    message.textContent = content.text;
  } else if (typeof content === "string") {
    message.textContent = content;
  }

  messagesList.appendChild(message);
  message.scrollIntoView({ behavior: "smooth" });
}

init();
