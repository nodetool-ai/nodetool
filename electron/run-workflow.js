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

import { WorkflowRunner } from "./workflow-runner.js";

import WaveSurfer from "wavesurfer.js";
import { marked } from "marked";

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

/** @typedef {import('./chat-interface.js').MessageContent} MessageContent */

/**
 * Checks if the schema has input fields
 * @param {JSONSchema} schema - The JSON schema to check
 * @returns {boolean} Whether the schema has input fields
 */
function hasInputFields(schema) {
  return schema.properties && Object.keys(schema.properties).length > 0;
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

  // Handle URI string
  const url =
    data instanceof Uint8Array
      ? URL.createObjectURL(new Blob([data], { type: "audio/wav" }))
      : data; // Use URI directly if data is a string

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

  const url =
    data instanceof Uint8Array
      ? URL.createObjectURL(new Blob([data], { type: "video/mp4" }))
      : data; // Use URI directly if data is a string

  const video = document.createElement("video");
  video.controls = true;
  video.src = url;

  // Only cleanup URL if we created it
  if (data instanceof Uint8Array) {
    video.onload = () => URL.revokeObjectURL(url);
  }

  videoContainer.appendChild(video);
  return videoContainer;
}

/**
 * Creates an image component
 * @param {Uint8Array} data - The image data
 * @returns {HTMLElement} The image element
 */
function createImage(data) {
  const container = document.createElement("div");
  container.className = "image-result";

  const dragIndicator = document.createElement("div");
  dragIndicator.className = "drag-indicator";
  dragIndicator.textContent = "↓ Drag image to save ↓";

  const img = document.createElement("img");
  img.draggable = true;

  // Add loading state
  img.style.opacity = "0";
  const loader = document.createElement("div");
  loader.className = "image-loader";
  loader.textContent = "Loading image...";
  container.appendChild(loader);

  try {
    const url =
      data instanceof Uint8Array ? URL.createObjectURL(new Blob([data])) : data; // Use URI directly if data is a string

    img.onload = () => {
      if (data instanceof Uint8Array) {
        URL.revokeObjectURL(url);
      }
      img.style.opacity = "1";
      loader.remove();
    };

    img.onerror = () => {
      loader.textContent = "Error loading image";
      console.error("Failed to load image");
    };

    img.src = url;
  } catch (error) {
    console.error("Error creating image:", error);
    loader.textContent = "Error creating image";
  }

  container.appendChild(dragIndicator);
  container.appendChild(img);

  return container;
}

/**
 * Creates a text component with markdown support
 * @param {string} text - The text to display
 * @returns {HTMLDivElement} The text element
 */
function createText(text) {
  const div = document.createElement("div");
  div.className = "markdown-content";
  // @ts-ignore
  div.innerHTML = marked.parse(text);
  return div;
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
 * Displays a single result in the UI
 * @param {any} result - The result to display
 * @returns {HTMLDivElement} The result field element
 */
function displayResult(result) {
  const field = document.createElement("div");
  field.className = "output-field";

  let content;
  if (result && typeof result === "object") {
    if (result.type === "audio") {
      content = createAudioPlayer(result.data || result.uri);
    } else if (result.type === "video") {
      content = createVideoPlayer(result.data || result.uri);
    } else if (result.type === "image") {
      content = createImage(result.data || result.uri);
    } else {
      content = createPreformatted(result);
    }
  } else if (typeof result === "string") {
    content = createText(result);
  } else {
    content = createPreformatted(result);
  }

  field.appendChild(content);
  return field;
}

/**
 * Hides the loader
 * @returns {void}
 */
function hideLoader() {
  const loaderContainer = document.querySelector(".loader-container");
  if (loaderContainer instanceof HTMLElement) {
    loaderContainer.style.display = "none";
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
      validateWorkflow(workflow);
      updateWorkflowMetadata(workflow);
      clearExistingErrors();

      if (isChatWorkflow(workflow.input_schema)) {
        await setupChatView(workflow, chatRunner);
      } else {
        await setupMiniAppView(workflow);
      }
    } catch (error) {
      handleWorkflowError(error);
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

/**
 * Sets up the chat interface for chat-based workflows
 * @param {Object} workflow - The workflow configuration
 * @param {ChatRunner} chatRunner - The chat runner instance
 */
async function setupChatView(workflow, chatRunner) {
  const chatView = document.querySelector(".chat-view");
  const container = document.querySelector(".container");

  if (chatView instanceof HTMLElement) {
    chatView.style.display = "block";
  }
  if (container instanceof HTMLElement) {
    container.style.display = "none";
  }

  const firstProperty = Object.entries(workflow.input_schema.properties)[0];
  const onSubmitChat = async (messageContents) => {
    if (!chatRunner.socket || chatRunner.status === "disconnected") {
      await chatRunner.connect(workflow.id);
    }
    await chatRunner.sendMessage({
      type: "message",
      role: "user",
      content: messageContents,
      workflow_id: workflow.id,
      auth_token: "local_token",
    });
  };

  generateChatInterface(
    document.querySelector(".chat-view"),
    firstProperty[0],
    onSubmitChat
  );
}

/**
 * Sets up the normal workflow interface for non-chat workflows
 * @param {Object} workflow - The workflow configuration
 */
async function setupMiniAppView(workflow) {
  const inputContainer = document.getElementById("input-container");
  if (inputContainer instanceof HTMLElement) {
    inputContainer.style.display = "block";
  }

  const onSubmitWorkflow = async (params) => {
    if (inputContainer instanceof HTMLElement) {
      inputContainer.style.display = "none";
    }
    disableInputFields(inputContainer);
    clearResults();

    const runner = new WorkflowRunner({ token: "local_token" });
    runner.onProgress(updateProgress);
    runner.onNodeUpdate((data) => {
      const nodeUpdateMessage = document.querySelector(".node-update-message");
      if (nodeUpdateMessage instanceof HTMLElement) {
        nodeUpdateMessage.textContent = `${data.node_name} ${data.status}`;
      }
      if (
        data.result &&
        data.result.output &&
        data.node_name.includes("Output")
      ) {
        const field = displayResult(data.result.output);
        const resultsContainer = document.querySelector(".results-container");
        if (resultsContainer instanceof HTMLElement) {
          resultsContainer.style.display = "block";
        }
        resultsContainer.appendChild(field);
        resultsContainer.scrollTop = resultsContainer.scrollHeight;
      }
    });

    try {
      await runner.run(workflow.id, params);
      hideLoader();
    } catch (error) {
      console.error("Workflow error:", error);
    } finally {
      enableInputFields(inputContainer);
    }
  };

  generateInputFields(workflow.input_schema, inputContainer, onSubmitWorkflow);
}

/**
 * Validates the workflow configuration
 * @param {Object} workflow - The workflow to validate
 */
function validateWorkflow(workflow) {
  if (!workflow) {
    throw new Error("No workflow received");
  }

  if (
    workflow.input_schema?.properties &&
    "" in workflow.input_schema.properties
  ) {
    throw new Error(
      "Invalid workflow: Input nodes must have names. Found an empty node name."
    );
  }
}

/**
 * Updates the workflow metadata in the UI
 * @param {Object} workflow - The workflow configuration
 */
function updateWorkflowMetadata(workflow) {
  const workflowName = document.querySelector(".workflow-name");
  if (workflowName instanceof HTMLElement) {
    workflowName.textContent = workflow.name;
  }

  const workflowDescription = document.querySelector(".workflow-description");
  if (workflowDescription instanceof HTMLElement) {
    if (workflow.description) {
      workflowDescription.textContent = workflow.description;
    } else {
      workflowDescription.style.display = "none";
    }
  }
}

/**
 * Clears any existing error messages from the UI
 * @returns {void}
 */
function clearExistingErrors() {
  // Clear error messages from input fields
  const errorMessages = document.querySelectorAll(".error-message");
  errorMessages.forEach((element) => element.remove());

  // Clear any error styling from input fields
  const inputFields = document.querySelectorAll(".input-field");
  inputFields.forEach((field) => field.classList.remove("error"));

  // Clear any global error messages
  const globalError = document.querySelector(".global-error");
  if (globalError instanceof HTMLElement) {
    globalError.style.display = "none";
    globalError.textContent = "";
  }
}

/**
 * Handles and displays workflow errors in the UI
 * @param {Error} error - The error to handle
 * @returns {void}
 */
function handleWorkflowError(error) {
  console.error("Workflow error:", error);

  // Get or create global error container
  let globalError = document.querySelector(".global-error");
  if (!globalError) {
    globalError = document.createElement("div");
    globalError.className = "global-error";
    document.querySelector(".container")?.prepend(globalError);
  }

  // Display the error message
  if (globalError instanceof HTMLElement) {
    globalError.style.display = "block";
    globalError.textContent = `Error: ${error.message}`;
  }

  // Hide the loader if it's visible
  const loaderContainer = document.querySelector(".loader-container");
  if (loaderContainer instanceof HTMLElement) {
    loaderContainer.style.display = "none";
  }

  // Re-enable any disabled input fields
  const inputContainer = document.getElementById("input-container");
  if (inputContainer instanceof HTMLElement) {
    enableInputFields(inputContainer);
  }
}
