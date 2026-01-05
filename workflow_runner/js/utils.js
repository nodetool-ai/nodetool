function updateOutput(message, type = "info") {
  const outputContent = document.getElementById("outputContent");
  const timestamp = new Date().toLocaleTimeString();
  
  let typeIcon = "";
  let typeClass = "";
  
  switch (type) {
    case "success":
      typeIcon = "✓";
      typeClass = "text-success";
      break;
    case "error":
      typeIcon = "✕";
      typeClass = "text-error";
      break;
    case "warning":
      typeIcon = "⚠";
      typeClass = "text-warning";
      break;
    case "info":
    default:
      typeIcon = "→";
      typeClass = "text-accent";
      break;
  }
  
  const formattedMessage = `[${timestamp}] ${typeIcon} ${message}`;
  const messageSpan = document.createElement("span");
  messageSpan.className = typeClass;
  messageSpan.textContent = formattedMessage + "\n";
  
  outputContent.appendChild(messageSpan);
  outputContent.scrollTop = outputContent.scrollHeight;
  console.log(message);
}

function updateWsMessages(message) {
  const wsContent = document.getElementById("wsContent");
  let displayMessage;

  if (typeof message === "string") {
    displayMessage =
      message.length > 300 ? message.slice(0, 300) + "..." : message;
  } else if (message instanceof ArrayBuffer || message instanceof Uint8Array) {
    displayMessage = "[Binary data - " + message.byteLength + " bytes]";
  } else if (typeof message === "object") {
    try {
      const stringified = JSON.stringify(
        message,
        (key, value) => {
          if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
            return "[Binary data]";
          }
          if (typeof value === "object" && value !== null) {
            if (value.type === "Buffer" && Array.isArray(value.data)) {
              return "[Binary Buffer]";
            }
            return Object.keys(value).reduce((acc, k) => {
              acc[k] =
                value[k] && typeof value[k] === "object"
                  ? "[Object]"
                  : value[k];
              return acc;
            }, {});
          }
          return value;
        },
        2
      );
      displayMessage =
        stringified.length > 300
          ? stringified.slice(0, 300) + "..."
          : stringified;
    } catch (error) {
      displayMessage = "[Unserializable object]";
    }
  } else {
    displayMessage =
      String(message).length > 300
        ? String(message).slice(0, 300) + "..."
        : String(message);
  }

  const timestamp = new Date().toLocaleTimeString();
  const messageSpan = document.createElement("span");
  messageSpan.innerHTML = `<span class="text-muted">[${timestamp}]</span> ${escapeHtml(displayMessage)}\n\n`;
  wsContent.appendChild(messageSpan);
  wsContent.scrollTop = wsContent.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showProgressBar() {
  const progressContainer = document.getElementById("progressContainer");
  if (progressContainer) {
    progressContainer.classList.add("visible");
  }
}

function hideProgressBar() {
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.querySelector(".progress-bar-fill");
  const progressText = document.getElementById("progressText");
  
  if (progressBar && progressText) {
    progressBar.style.width = "0%";
    progressText.textContent = "0%";
  }
  
  if (progressContainer) {
    progressContainer.classList.remove("visible");
  }
}

function updateProgress(percentage) {
  const progressBar = document.querySelector(".progress-bar-fill");
  const progressText = document.getElementById("progressText");
  if (progressBar && progressText) {
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${Math.round(percentage)}%`;
  }
}

function checkWorkflowIO(workflow) {
  console.log("Checking workflow IO:", workflow);

  const hasInputs =
    workflow.input_schema &&
    Object.keys(workflow.input_schema.properties).length > 0;
  const hasOutputs =
    workflow.output_schema &&
    Object.keys(workflow.output_schema.properties).length > 0;

  console.log("Has inputs:", hasInputs);
  console.log("Has outputs:", hasOutputs);

  let warningMessage = "";
  if (!hasInputs && !hasOutputs) {
    warningMessage = "This workflow has no inputs or outputs.";
  } else if (!hasInputs) {
    warningMessage = "This workflow has no inputs.";
  } else if (!hasOutputs) {
    warningMessage = "This workflow has no outputs.";
  }

  console.log("Warning message:", warningMessage);
  return warningMessage;
}

function displayWarning(message) {
  let warningElement = document.getElementById("workflowWarning");
  const dynamicInputs = document.getElementById("dynamicInputs");
  const workflowForm = document.getElementById("workflowForm");
  
  if (!warningElement) {
    warningElement = document.createElement("div");
    warningElement.id = "workflowWarning";
    warningElement.className = "warning-message";
    
    if (workflowForm && dynamicInputs) {
      workflowForm.insertBefore(warningElement, dynamicInputs);
    } else if (workflowForm) {
      workflowForm.appendChild(warningElement);
    } else {
      console.warn("Cannot display warning: workflowForm not found");
      return;
    }
  }

  warningElement.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
    <span>${message}</span>
  `;
  warningElement.style.display = message ? "flex" : "none";
}

function getInputValues(schema) {
  const values = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    const input = document.getElementById(key);
    if (!input) {
      console.warn(`Input element not found for key: ${key}`);
      continue;
    }
    
    if (input.type === "checkbox") {
      values[key] = input.checked;
    } else if (input.type === "range") {
      values[key] = parseFloat(input.value);
    } else if (input.type === "number") {
      values[key] = parseFloat(input.value);
    } else {
      values[key] = input.value;
    }
  }
  return values;
}

async function runWorkflow(workflowRunner, workflowId, params) {
  try {
    updateOutput("Running workflow...", "info");
    showProgressBar();

    if (
      !workflowRunner.socket ||
      workflowRunner.socket.readyState !== WebSocket.OPEN
    ) {
      updateOutput("Connecting to WebSocket...", "info");
      await workflowRunner.connect();
      updateOutput("WebSocket connected.", "success");
    }

    updateOutput("Sending workflow run request...", "info");
    const result = await workflowRunner.run(workflowId, params);
    updateOutput("Workflow request sent. Waiting for response...", "info");

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Workflow execution timed out")), 60000)
    );

    const workflowResult = await Promise.race([result, timeoutPromise]);
    updateOutput("Workflow completed successfully", "success");
    return workflowResult;
  } catch (error) {
    updateOutput("Error: " + error.message, "error");
    throw error;
  } finally {
    hideProgressBar();
  }
}
