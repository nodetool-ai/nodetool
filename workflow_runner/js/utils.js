function updateOutput(message) {
  const outputContent = document.getElementById("outputContent");
  outputContent.textContent += message + "\n";
  console.log(message);
}

function updateWsMessages(message) {
  const wsContent = document.getElementById("wsContent");
  let displayMessage;

  if (typeof message === "string") {
    displayMessage =
      message.length > 100 ? message.slice(0, 100) + "..." : message;
  } else if (message instanceof ArrayBuffer || message instanceof Uint8Array) {
    displayMessage = "[Binary data]";
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
        stringified.length > 200
          ? stringified.slice(0, 200) + "..."
          : stringified;
    } catch (error) {
      displayMessage = "[Unserializable object]";
    }
  } else {
    displayMessage =
      String(message).length > 100
        ? String(message).slice(0, 100) + "..."
        : String(message);
  }

  wsContent.textContent += displayMessage + "\n\n";
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

  // Create custom tooltip
  let tooltip = warningElement.querySelector(".custom-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "custom-tooltip";
    tooltip.innerHTML = `
    <ul>
      <li><strong>Workflows without inputs:</strong><br/> Will use default input values.</li>
      <li><strong>Workflows without outputs:</strong><br/> Results will not be visible here.<br/>
      Useful in some cases, but usually not.
      </li>      
    </ul>
  `;
    warningElement.appendChild(tooltip);
  }
  // Add tooltip functionality for both desktop and mobile
  const showTooltip = () => {
    tooltip.style.visibility = "visible";
    tooltip.style.opacity = "1";
  };

  const hideTooltip = () => {
    tooltip.style.visibility = "hidden";
    tooltip.style.opacity = "0";
  };

  // For desktop
  warningElement.addEventListener("mouseover", showTooltip);
  warningElement.addEventListener("mouseout", hideTooltip);

  // For mobile
  warningElement.addEventListener("touchstart", (e) => {
    e.preventDefault(); // Prevent default touch behavior
    showTooltip();
  });

  warningElement.addEventListener("touchend", (e) => {
    e.preventDefault(); // Prevent default touch behavior
    hideTooltip();
  });

  // Close tooltip when tapping outside
  document.addEventListener("touchstart", (e) => {
    if (!warningElement.contains(e.target)) {
      hideTooltip();
    }
  });
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
      updateOutput("Connecting to WebSocket...");
      await workflowRunner.connect();
      updateOutput("WebSocket connected.");
    }

    updateOutput("Sending workflow run request...");
    const result = await workflowRunner.run(workflowId, params);
    updateOutput("Workflow request sent. Waiting for response...");

    // Add a timeout to prevent hanging indefinitely
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Workflow execution timed out")), 60000)
    );

    const workflowResult = await Promise.race([result, timeoutPromise]);
    updateOutput("Workflow completed");
    return workflowResult;
  } catch (error) {
    updateOutput("Error: " + error.message);
    throw error;
  } finally {
    hideProgressBar();
  }
}

function handleResult(result) {
  const resultsContainer = document.getElementById("results");
  const outputFields = resultsContainer.querySelectorAll(".output-field");

  if (!result || typeof result !== "object") {
    console.error("Invalid result:", result);
    updateOutput("Error: Received invalid result from the workflow");
    outputFields.forEach((field) => {
      const placeholder = field.querySelector('[class$="-placeholder"]');
      placeholder.textContent = "No data available";
    });
    return;
  }

  outputFields.forEach((field) => {
    const label = field.querySelector("label").textContent;
    const placeholder = field.querySelector('[class$="-placeholder"]');

    let outputValue = result[label];

    if (outputValue === undefined || outputValue === null) {
      placeholder.textContent = "No data available";
      return;
    }

    if (typeof outputValue === "object") {
      if (outputValue.type === "image" && outputValue.data) {
        const img = document.createElement("img");
        const data = new Uint8Array(outputValue.data);
        const blob = new Blob([data], { type: "image/png" });
        img.src = URL.createObjectURL(blob);
        placeholder.innerHTML = "";
        placeholder.appendChild(img);
      } else if (outputValue.type === "audio" && outputValue.data) {
        const audio = placeholder;
        const data = new Uint8Array(outputValue.data);
        const blob = new Blob([data], { type: "audio/mpeg" });
        audio.src = URL.createObjectURL(blob);
      } else if (outputValue.type === "video" && outputValue.data) {
        const video = placeholder;
        const data = new Uint8Array(outputValue.data);
        const blob = new Blob([data], { type: "video/mp4" });
        video.src = URL.createObjectURL(blob);
      } else {
        placeholder.textContent = JSON.stringify(outputValue, null, 2);
      }
    } else {
      placeholder.textContent = String(outputValue);
    }
  });

  console.log("Full result object:", result);
  updateOutput("Workflow completed successfully");
}
