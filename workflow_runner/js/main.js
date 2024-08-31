const apiUrl = "https://api.nodetool.ai/api";
const workerUrl = "wss://api.nodetool.ai/predict";

const workflowRunner = new WorkflowRunner(apiUrl, workerUrl);
workflowRunner.onProgress = (progress) => {
  updateProgress(progress);
};
workflowRunner.onMessage = (message) => {
  updateWsMessages(JSON.stringify(message, null, 2));
  if (message.type === "progress_update") {
    updateProgress(message.progress);
  }
};
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

  // Add event listener for the runWorkflowBtn
  runWorkflowBtn.addEventListener("click", runWorkflow);
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

// Expose the selectWorkflow function globally
window.selectWorkflow = selectWorkflow;

// Add the runWorkflow function
async function runWorkflow() {
  const selectedWorkflow = document.querySelector(".workflow-item.selected");
  if (!selectedWorkflow) {
    updateOutput("Please select a workflow before running.");
    return;
  }

  const workflowId = selectedWorkflow.dataset.id;
  const workflow = window.workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    updateOutput("Selected workflow not found.");
    return;
  }

  const params = getInputValues(workflow.input_schema);
  if (!params) {
    updateOutput("Failed to retrieve input values.");
    return;
  }

  runWorkflowBtn.disabled = true;

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
    handleResult(result);
  } catch (error) {
    updateOutput("Error: " + error.message);
  } finally {
    hideProgressBar();
    runWorkflowBtn.disabled = false;
  }
}
