function updateOutput(message) {
  const outputContent = document.getElementById("outputContent");
  outputContent.textContent += message + "\n";
  console.log(message);
}

function updateWsMessages(message) {
  const wsContent = document.getElementById("wsContent");
  wsContent.textContent += message + "\n\n";
  wsContent.scrollTop = wsContent.scrollHeight;
}

function showProgressBar() {
  const progressContainer = document.getElementById("progressContainer");
  if (progressContainer) {
    progressContainer.style.display = "flex";
  }
}

function hideProgressBar() {
  const progressContainer = document.getElementById("progressContainer");
  if (progressContainer) {
    progressContainer.style.display = "none";
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
    warningMessage = "Warning: This workflow has no inputs or outputs.";
  } else if (!hasInputs) {
    warningMessage = "Warning: This workflow has no inputs.";
  } else if (!hasOutputs) {
    warningMessage = "Warning: This workflow has no outputs.";
  }

  console.log("Warning message:", warningMessage);
  return warningMessage;
}

function displayWarning(message) {
  let warningElement = document.getElementById("workflowWarning");
  if (!warningElement) {
    warningElement = document.createElement("div");
    warningElement.id = "workflowWarning";
    warningElement.className = "warning-message";
    document
      .getElementById("workflowForm")
      .insertBefore(warningElement, document.getElementById("dynamicInputs"));
  }

  warningElement.textContent = message;
  warningElement.style.display = message ? "block" : "none";
}

function getInputValues(schema) {
  const values = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    const input = document.getElementById(key);
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
    updateOutput("Running workflow...");
    showProgressBar();

    if (
      !workflowRunner.socket ||
      workflowRunner.socket.readyState !== WebSocket.OPEN
    ) {
      await workflowRunner.connect();
    }

    const result = await workflowRunner.run(workflowId, params);
    updateOutput("Workflow completed");
    return result;
  } catch (error) {
    updateOutput("Error: " + error.message);
    throw error;
  } finally {
    hideProgressBar();
  }
}
