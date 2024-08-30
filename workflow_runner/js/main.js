const apiUrl = "https://api.nodetool.ai/api"; // Replace with your actual API URL
const workerUrl = "wss://api.nodetool.ai/predict"; // Replace with your actual WebSocket URL

const workflowRunner = new WorkflowRunner(apiUrl, workerUrl);

const loadWorkflowsBtn = document.getElementById("loadWorkflowsBtn");
const runWorkflowBtn = document.getElementById("runWorkflowBtn");
let workflows = [];

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded");
  document.getElementById("workflowForm").style.display = "none";

  const toggleLogsBtn = document.getElementById("toggleLogsBtn");
  const rightContainer = document.querySelector(".right-container");

  toggleLogsBtn.addEventListener("click", () => {
    rightContainer.classList.toggle("hidden");
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
    workflows = await workflowRunner.loadWorkflows();
    updateOutput("Workflows loaded successfully");
    createWorkflowSelectionWidget(workflows);
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
    const workflowId = document.querySelector(".workflow-item.selected").dataset
      .id;
    const workflow = workflows.find((w) => w.id === workflowId);
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

        if (outputValue.type === "image") {
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
      logsContainer.style.display = "none";
      toggleLogsBtn.textContent = "Show Logs";
    }
  });
});
