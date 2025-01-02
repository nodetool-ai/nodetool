import ChatRunner from "./chat-runner.js";
import {
  generateChatInterface,
  appendMessage,
  handleChatMessage,
} from "./chat-interface.js";

import {
  disableInputFields,
  enableInputFields,
  generateInputFields,
} from "./input-generator.js";

// @ts-ignore
import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";

const WORKER_URL = "ws://127.0.0.1:8000/predict";
/**
 * @typedef {Object} JSONSchema
 * @property {string} type - The data type (string, number, boolean, object, array, null)
 * @property {string} [title] - Human-readable title
 * @property {string} [label] - Human-readable label (preferred over title)
 * @property {string} [description] - Human-readable description
 * @property {string} [format] - Format of the input
 * @property {string} [const] - Constant value for the schema
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

    this.onProgressCallback = null;
    this.onErrorCallback = null;
    this.onNodeUpdateCallback = null;
    this.onJobUpdateCallback = null;
  }

  /**
   * Sets the progress callback
   * @param {Function} callback - The callback function
   * @returns {void}
   */
  onProgress(callback) {
    this.onProgressCallback = callback;
  }

  /**
   * Sets the error callback
   * @param {Function} callback - The callback function
   * @returns {void}
   */
  onError(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Sets the node update callback
   * @param {Function} callback - The callback function
   * @returns {void}
   */
  onNodeUpdate(callback) {
    this.onNodeUpdateCallback = callback;
  }

  /**
   * Sets the job update callback
   * @param {Function} callback - The callback function
   * @returns {void}
   */
  onJobUpdate(callback) {
    this.onJobUpdateCallback = callback;
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

        if (data.type === "job_update") {
          if (this.onJobUpdateCallback) {
            this.onJobUpdateCallback(data);
          }
          if (data.status === "completed") {
            resolve(data.result);
          } else if (data.status === "failed") {
            reject(new Error(data.error));
          }
        } else if (data.type === "node_progress") {
          if (this.onProgressCallback) {
            this.onProgressCallback(data.progress, data.total);
          }
        } else if (data.type === "node_update") {
          if (this.onNodeUpdateCallback) {
            this.onNodeUpdateCallback(data);
          }
        }
      };
    });
  }
}

/**
 * Clears the results container
 * @returns {void}
 */
function clearResults() {
  const resultsContainer = document.querySelector(".results-container");
  if (resultsContainer instanceof HTMLElement) {
    resultsContainer.innerHTML = "";
  }
}

/**
 * Updates the chat progress bar and percentage text
 * @param {number} percentage - The progress percentage (0-100)
 * @returns {void}
 */
function updateChatProgress(percentage) {
  const progressBar = document.querySelector(".chat-progress-bar");
  const progressFill = document.querySelector(".chat-progress-fill");
  if (
    progressBar instanceof HTMLElement &&
    progressFill instanceof HTMLElement
  ) {
    progressBar.style.display = "block";
    progressFill.style.display = "block";
    progressFill.style.width = `${percentage}%`;
    if (percentage > 10) {
      progressFill.textContent = `${Math.round(percentage)}%`;
    }
  }
}

/**
 * Updates the progress bar and percentage text
 * @param {number} progress - The progress count
 * @param {number} total - The total progress
 * @returns {void}
 */
function updateProgress(progress, total) {
  const percentage = (progress / total) * 100;
  const progressBar = document.querySelector(".progress-bar");
  if (progressBar instanceof HTMLElement) {
    progressBar.style.display = "block";
  }
  const progressFill = document.querySelector(".progress-fill");
  if (progressFill instanceof HTMLElement) {
    progressFill.style.width = `${percentage}%`;
    if (percentage > 10) {
      progressFill.textContent = `${Math.round(percentage)}%`;
    }
  }

  const futuristicLoader = document.querySelector(".futuristic-loader");
  if (futuristicLoader instanceof HTMLElement) {
    futuristicLoader.style.display = "none";
  }
}

/**
 * Creates an audio player component using WaveSurfer
 * @param {Uint8Array} data - The audio data
 * @returns {HTMLElement} The audio player container
 */
function createAudioPlayer(data) {
  const audioContainer = document.createElement("div");
  audioContainer.className = "audio-controls-container";

  const waveformContainer = document.createElement("div");
  waveformContainer.className = "waveform";

  const timeDisplay = document.createElement("div");
  timeDisplay.className = "time-display";

  const controls = document.createElement("div");
  controls.className = "audio-controls";

  // Create blob and URL only once
  const blob = new Blob([data], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);

  // Clean up the URL when the audio is loaded
  const cleanup = () => {
    URL.revokeObjectURL(url);
  };

  const wavesurfer = WaveSurfer.create({
    container: waveformContainer,
    waveColor: "#76e5b8",
    progressColor: "#a2a2a2",
    cursorColor: "#e0e0e0",
    barWidth: 1,
    barHeight: 1.0,
    barGap: 1,
    height: 50,
    responsive: true,
    normalize: true,
    fillParent: true,
  });

  // Add load event listener to clean up URL
  wavesurfer.on("destroy", cleanup);
  wavesurfer.load(url);

  const playButton = document.createElement("button");
  playButton.innerHTML = "▶";
  playButton.onclick = () => {
    wavesurfer.playPause();
    playButton.innerHTML = wavesurfer.isPlaying() ? "⏸" : "▶";
  };
  playButton.classList.add("play-button");

  wavesurfer.on("audioprocess", () => {
    const currentTime = wavesurfer.getCurrentTime();
    const duration = wavesurfer.getDuration();
    timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(
      duration
    )}`;
  });

  controls.appendChild(playButton);
  audioContainer.appendChild(waveformContainer);
  audioContainer.appendChild(controls);
  audioContainer.appendChild(timeDisplay);

  return audioContainer;
}

/**
 * Creates a video player component
 * @param {Uint8Array} data - The video data
 * @returns {HTMLDivElement} The video player element
 */
function createVideoPlayer(data) {
  const videoContainer = document.createElement("div");
  videoContainer.className = "video-container";

  const blob = new Blob([data], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);

  const video = document.createElement("video");
  video.controls = true;
  video.src = url;

  // Clean up URL when video loads
  video.onload = () => URL.revokeObjectURL(url);

  videoContainer.appendChild(video);
  return videoContainer;
}

/**
 * Creates an image component
 * @param {Uint8Array} data - The image data
 * @returns {HTMLElement} The image element
 */
function createImage(data) {
  // Create container
  const container = document.createElement("div");
  container.className = "image-result";

  // Create drag indicator
  const dragIndicator = document.createElement("div");
  dragIndicator.className = "drag-indicator";
  dragIndicator.textContent = "↓ Drag image to save ↓";

  // Create and setup image
  const img = document.createElement("img");
  img.draggable = true;
  const blob = new Blob([data], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  img.onload = () => URL.revokeObjectURL(url);
  img.src = url;

  // Assemble
  container.appendChild(dragIndicator);
  container.appendChild(img);

  return container;
}

/**
 * Creates a text component
 * @param {string} text - The text to display
 * @returns {HTMLParagraphElement} The text element
 */
function createText(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

/**
 * Creates a pre-formatted text component
 * @param {any} value - The value to display
 * @returns {HTMLPreElement} The pre element
 */
function createPreformatted(value) {
  const pre = document.createElement("pre");
  pre.textContent =
    typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  return pre;
}

/**
 * Displays the workflow results in the UI
 * @param {Object} results - The results object from the workflow
 * @param {JSONSchema} outputSchema - The output schema of the workflow
 * @returns {void}
 */
function displayResults(results, outputSchema) {
  const loaderContainer = document.querySelector(".loader-container");
  if (loaderContainer instanceof HTMLElement) {
    loaderContainer.style.display = "none";
  }
  const resultsContainer = document.querySelector(".results-container");
  if (resultsContainer instanceof HTMLElement) {
    resultsContainer.style.display = "block";
  }

  for (const [key, value] of Object.entries(results)) {
    const fieldSchema = outputSchema.properties[key];
    const field = document.createElement("div");
    field.className = "output-field";

    let content;
    if (fieldSchema.type === "object") {
      if (fieldSchema.properties.type.const === "audio") {
        content = createAudioPlayer(value.data);
      } else if (fieldSchema.properties.type.const === "video") {
        content = createVideoPlayer(value.data);
      } else if (fieldSchema.properties.type.const === "image") {
        content = createImage(value.data);
      } else {
        content = createPreformatted(value);
      }
    } else if (fieldSchema.type === "string") {
      content = createText(value);
    } else {
      content = createPreformatted(value);
    }

    field.appendChild(content);
    resultsContainer.appendChild(field);
  }
}

// Helper function to format time
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * Sets up the window control buttons
 * @returns {HTMLDivElement} The window controls container element
 */
function setupWindowControls() {
  const windowControls = document.createElement("div");
  windowControls.className = "window-controls";

  const minimizeButton = document.createElement("button");
  minimizeButton.className = "window-control-button";
  minimizeButton.innerHTML = "&#x2014;";
  minimizeButton.onclick = () => {
    // @ts-ignore
    window.windowControls.minimize();
  };

  const maximizeButton = document.createElement("button");
  maximizeButton.className = "window-control-button";
  maximizeButton.innerHTML = "&#x2610;";
  maximizeButton.onclick = () => {
    // @ts-ignore
    window.windowControls.maximize();
  };

  const closeButton = document.createElement("button");
  closeButton.className = "window-control-button";
  closeButton.id = "close-button";
  closeButton.innerHTML = "&#x2715;";
  closeButton.onclick = () => {
    // @ts-ignore
    window.windowControls.close();
  };

  windowControls.appendChild(minimizeButton);
  windowControls.appendChild(maximizeButton);
  windowControls.appendChild(closeButton);

  document.body.appendChild(windowControls);

  return windowControls;
}

export async function init() {
  setupWindowControls();
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
    console.log("Progress:", progress, total);
    if (total > 0) {
      updateChatProgress((progress / total) * 100);
    }
  });

  chatRunner.onJobUpdate((data) => {
    const loadingMessage = document.querySelector(".loading-message");
    if (data.message) {
      if (loadingMessage instanceof HTMLElement) {
        loadingMessage.textContent = data.message;
      }
    }
  });

  chatRunner.onNodeUpdate((data) => {
    const loadingMessage = document.querySelector(".loading-message");
    if (loadingMessage instanceof HTMLElement) {
      loadingMessage.textContent = `${data.node_name} ${data.status}`;
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

      const workflowName = document.querySelector(".workflow-name");
      if (workflowName instanceof HTMLElement) {
        workflowName.textContent = workflow.name;
      }

      const workflowDescription = document.querySelector(
        ".workflow-description"
      );
      if (workflowDescription instanceof HTMLElement) {
        if (workflow.description) {
          workflowDescription.textContent = workflow.description;
        } else {
          workflowDescription.style.display = "none";
        }
      }

      if (hasInputFields(workflow.input_schema)) {
        const firstProperty = Object.entries(
          workflow.input_schema.properties
        )[0];
        if (firstProperty && firstProperty[1].format === "chat") {
          const chatView = document.querySelector(".chat-view");
          const container = document.querySelector(".container");

          if (chatView instanceof HTMLElement) {
            chatView.style.display = "block";
          }
          if (container instanceof HTMLElement) {
            container.style.display = "none";
          }

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

          generateChatInterface(
            document.querySelector(".chat-view"),
            firstProperty[0],
            onSubmitChat
          );
        } else {
          const inputContainer = document.getElementById("input-container");
          if (inputContainer instanceof HTMLElement) {
            inputContainer.style.display = "block";
          }

          /**
           * @param {Object} params - The parameters to pass to the workflow
           * @returns {Promise<void>}
           */
          const onSubmitWorkflow = async (params) => {
            disableInputFields(inputContainer);
            clearResults();

            // For non-chat workflows, use the regular WorkflowRunner
            const runner = new WorkflowRunner({ token: "local_token" });
            runner.onProgress(updateProgress);
            runner.onNodeUpdate((data) => {
              const nodeUpdateMessage = document.querySelector(
                ".node-update-message"
              );
              if (nodeUpdateMessage instanceof HTMLElement) {
                nodeUpdateMessage.textContent = `${data.node_name} ${data.status}`;
              }
            });
            runner
              .run(workflow.id, params)
              .then((results) => {
                displayResults(results, workflow.output_schema);
                enableInputFields(inputContainer);
              })
              .catch((error) => {
                console.error("Workflow error:", error);
                enableInputFields(inputContainer);
              });
          };

          generateInputFields(
            workflow.input_schema,
            inputContainer,
            onSubmitWorkflow
          );
        }
      } else {
        const runner = new WorkflowRunner({ token: "local_token" });
        runner
          .run(workflow.id, {})
          .then((results) => {
            displayResults(results, workflow.output_schema);
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
