const apiUrl = "https://api.nodetool.ai/api"; // Replace with your actual API URL
const workerUrl = "wss://api.nodetool.ai/predict"; // Replace with your actual WebSocket URL

const workflowRunner = new WorkflowRunner(apiUrl, workerUrl);

const loadWorkflowsBtn = document.getElementById("loadWorkflowsBtn");
const runWorkflowBtn = document.getElementById("runWorkflowBtn");
window.workflows = [];

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded");
  document.getElementById("workflowForm").style.display = "none";

  const toggleLogsBtn = document.getElementById("toggleLogsBtn");
  const rightContainer = document.querySelector(".right-container");
  const middleContainer = document.querySelector(".middle-container");

  toggleLogsBtn.addEventListener("click", () => {
    rightContainer.classList.toggle("hidden");
    middleContainer.classList.toggle("expanded");
    toggleLogsBtn.textContent = rightContainer.classList.contains("hidden")
      ? "Show Logs"
      : "Hide Logs";
  });
});

document
  .getElementById("tokenForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = document.getElementById("token").value;
    workflowRunner.token = token;
    await loadWorkflows();
  });

async function loadWorkflows() {
  updateOutput("Loading workflows...");
  try {
    const response = await workflowRunner.loadWorkflows();
    window.workflows = Array.isArray(response)
      ? response
      : response.workflows || [];
    updateOutput("Workflows loaded successfully");
    createWorkflowSelectionWidget(window.workflows);
    document.getElementById("workflowForm").style.display = "block";
  } catch (error) {
    updateOutput("Error loading workflows: " + error.message);
  }
}

async function selectWorkflow(workflowId) {
  try {
    document.getElementById("outputContent").textContent = "";
    document.getElementById("wsContent").textContent = "";

    const workflowDetails = await workflowRunner.getWorkflowDetails(workflowId);

    const warningMessage = checkWorkflowIO(workflowDetails);
    displayWarning(warningMessage);

    generateInputFields(
      workflowDetails.input_schema,
      document.getElementById("dynamicInputs")
    );
    generateOutputFields(
      workflowDetails.output_schema,
      document.getElementById("results")
    );
  } catch (error) {
    updateOutput("Error loading workflow details: " + error.message);
  }
}

document.getElementById("workflowSearch").addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const filteredWorkflows = workflows.filter((workflow) =>
    workflow.name.toLowerCase().includes(searchTerm)
  );
  createWorkflowSelectionWidget(filteredWorkflows);
});

document
  .getElementById("workflowForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedWorkflowElement = document.querySelector(
      ".workflow-item.selected"
    );
    if (!selectedWorkflowElement) {
      updateOutput("Please select a workflow before running.");
      return;
    }
    const workflowId = selectedWorkflowElement.dataset.id;
    const workflow = window.workflows.find((w) => w.id === workflowId);
    if (!workflow) {
      updateOutput(
        "Selected workflow not found. Please try reloading the workflows."
      );
      return;
    }
    const params = getInputValues(workflow.input_schema);

    runWorkflowBtn.disabled = true;
    try {
      updateOutput("Running workflow...");
      showProgressBar();
      const result = await workflowRunner.run(workflowId, params);
      updateOutput("Workflow completed");

      const resultsContainer = document.getElementById("results");
      const outputFields = resultsContainer.querySelectorAll(".output-field");

      outputFields.forEach((field) => {
        const label = field.querySelector("h4").textContent;
        const placeholder = field.querySelector('[class$="-placeholder"]');
        const outputValue = result[label];

        if (outputValue && outputValue.type === "image") {
          const img = document.createElement("img");
          const data = new Uint8Array(outputValue.data);
          const blob = new Blob([data], { type: "image/png" });
          img.src = URL.createObjectURL(blob);
          placeholder.replaceWith(img);
        } else if (typeof outputValue === "object") {
          placeholder.textContent = JSON.stringify(outputValue, null, 2);
        } else {
          placeholder.textContent = String(outputValue);
        }
      });
    } catch (error) {
      updateOutput("Error: " + error.message);
    } finally {
      hideProgressBar();
      runWorkflowBtn.disabled = false;
    }
  });

// Expose the selectWorkflow function globally
window.selectWorkflow = selectWorkflow;

document.addEventListener("DOMContentLoaded", () => {
  const toggleLogsBtn = document.getElementById("toggleLogsBtn");
  const logsContainer = document.querySelector(".logs-container");

  toggleLogsBtn.addEventListener("click", () => {
    if (logsContainer.style.display === "none") {
      logsContainer.style.display = "block";
      toggleLogsBtn.textContent = "Hide Logs";
    } else {
      toggleLogsBtn.textContent = "Show Logs";
    }
  });
});

workflowRunner.socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "progress_update") {
    updateProgress(data.progress);
  }
  // ... handle other message types
};
