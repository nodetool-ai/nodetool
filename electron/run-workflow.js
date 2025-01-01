import ChatRunner from "./chat-runner.js";
import {
  generateChatInterface,
  appendMessage,
  handleChatMessage,
} from "./chat-interface.js";

import { generateInputFields } from "./input-generator.js";

const WORKER_URL = "ws://127.0.0.1:8000/predict";
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
 * Checks if the schema has input fields
 * @param {JSONSchema} schema - The JSON schema to check
 * @returns {boolean} Whether the schema has input fields
 */
function hasInputFields(schema) {
  return schema.properties && Object.keys(schema.properties).length > 0;
}

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
export async function init() {
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

  chatRunner.onMessage(handleChatMessage);

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

document.addEventListener("DOMContentLoaded", () => {
  init();
});
