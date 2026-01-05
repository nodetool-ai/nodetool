const apiUrl = "http://localhost:7777/api";
const workerUrl = "ws://localhost:7777/ws";

let workflowRunner;
let runWorkflowBtn;
let selectedWorkflowId = null;
window.workflows = [];
window.previewResults = {};
window.outputResults = {};
window.nodeStatuses = {};

async function loadWorkflows() {
  try {
    const response = await workflowRunner.loadWorkflows();
    window.workflows = Array.isArray(response)
      ? response
      : response.workflows || [];
    updateOutput("Workflows loaded successfully", "success");
    createWorkflowSelectionWidget(window.workflows);
    
    const workflowForm = document.getElementById("workflowForm");
    if (workflowForm) {
      workflowForm.style.display = "block";
    }
  } catch (error) {
    updateOutput("Error loading workflows: " + error.message, "error");
  }
}

async function selectWorkflow(workflowId) {
  try {
    const outputContent = document.getElementById("outputContent");
    const wsContent = document.getElementById("wsContent");
    
    if (outputContent) outputContent.textContent = "";
    if (wsContent) wsContent.textContent = "";

    // Clear previous results and statuses
    window.previewResults = {};
    window.outputResults = {};
    window.nodeStatuses = {};
    
    // Update selected workflow ID
    selectedWorkflowId = workflowId;
    
    // Clear preview and results sections
    clearPreviewsSection();
    clearResultsSection();

    const workflowDetails = await workflowRunner.getWorkflowDetails(workflowId);

    const warningMessage = checkWorkflowIO(workflowDetails);
    displayWarning(warningMessage);

    // Update graph visualization
    updateGraphVisualization(workflowDetails);

    const dynamicInputs = document.getElementById("dynamicInputs");
    const results = document.getElementById("results");
    
    if (dynamicInputs) {
      generateInputFields(
        workflowDetails.input_schema,
        dynamicInputs
      );
    }
    if (results) {
      generateOutputFields(
        workflowDetails.output_schema,
        results
      );
    }
  } catch (error) {
    updateOutput("Error loading workflow details: " + error.message, "error");
  }
}

window.selectWorkflow = selectWorkflow;

/**
 * Update the graph visualization with workflow structure
 */
function updateGraphVisualization(workflowDetails) {
  const graphContainer = document.getElementById("workflowGraph");
  if (!graphContainer) return;
  
  // Clear existing content
  graphContainer.innerHTML = "";
  
  // Create and append graph container
  const graph = createWorkflowGraph();
  graphContainer.appendChild(graph);
  
  // Update with actual graph data
  updateWorkflowGraph(workflowDetails, graph);
}

/**
 * Clear the previews section and show empty state
 */
function clearPreviewsSection() {
  const previewsContainer = document.getElementById("previews");
  if (previewsContainer) {
    previewsContainer.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <p>Intermediate results will appear here during execution</p>
      </div>
    `;
  }
  const previewStatus = document.getElementById("previewStatus");
  if (previewStatus) {
    previewStatus.style.display = "none";
  }
}

/**
 * Clear the results section and show empty state
 */
function clearResultsSection() {
  const resultsContainer = document.getElementById("results");
  if (resultsContainer) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        <p>Final results will appear here after completion</p>
      </div>
    `;
  }
}

async function runWorkflow() {
  const selectedWorkflow = document.querySelector(".workflow-item.selected");
  if (!selectedWorkflow) {
    updateOutput("Please select a workflow before running.", "warning");
    return;
  }

  const workflowId = selectedWorkflow.dataset.id;
  const workflow = window.workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    updateOutput("Selected workflow not found.", "error");
    return;
  }

  const params = getInputValues(workflow.input_schema);
  if (!params) {
    updateOutput("Failed to retrieve input values.", "error");
    return;
  }

  if (!runWorkflowBtn) {
    runWorkflowBtn = document.getElementById("runWorkflowBtn");
  }
  
  if (runWorkflowBtn) {
    runWorkflowBtn.disabled = true;
    runWorkflowBtn.innerHTML = `
      <span class="spinner spinner-sm"></span>
      Running...
    `;
  }

  try {
    updateOutput("Running workflow...", "info");
    showProgressBar();

    if (
      !workflowRunner.socket ||
      workflowRunner.socket.readyState !== WebSocket.OPEN
    ) {
      await workflowRunner.connect();
    }

    // Clear previous results
    window.previewResults = {};
    window.outputResults = {};
    window.nodeStatuses = {};
    clearPreviewsSection();

    const result = await workflowRunner.run(workflowId, params);
    updateOutput("Workflow completed successfully", "success");
    handleResult(result);
  } catch (error) {
    updateOutput("Error: " + error.message, "error");
  } finally {
    hideProgressBar();
    const previewStatus = document.getElementById("previewStatus");
    if (previewStatus) {
      previewStatus.style.display = "none";
    }
    if (runWorkflowBtn) {
      runWorkflowBtn.disabled = false;
      runWorkflowBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Run Workflow
      `;
    }
  }
}

async function runSelectedWorkflow() {
  const selectedWorkflow = document.querySelector(".workflow-item.selected");
  if (!selectedWorkflow) {
    updateOutput("Please select a workflow before running.", "warning");
    return;
  }

  const workflowId = selectedWorkflow.dataset.id;
  const workflow = window.workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    updateOutput("Selected workflow not found.", "error");
    return;
  }

  const params = getInputValues(workflow.input_schema);
  if (!params) {
    updateOutput("Failed to retrieve input values.", "error");
    return;
  }

  if (!runWorkflowBtn) {
    runWorkflowBtn = document.getElementById("runWorkflowBtn");
  }
  
  if (runWorkflowBtn) {
    runWorkflowBtn.disabled = true;
    runWorkflowBtn.innerHTML = `
      <span class="spinner spinner-sm"></span>
      Running...
    `;
  }

  try {
    updateOutput("Running workflow...", "info");
    const result = await runWorkflow(workflowRunner, workflowId, params);
    if (result === undefined) {
      throw new Error("Workflow returned undefined result");
    }
    handleResult(result);
  } catch (error) {
    console.error("Error running workflow:", error);
    updateOutput("Error: " + error.message, "error");
  } finally {
    if (runWorkflowBtn) {
      runWorkflowBtn.disabled = false;
      runWorkflowBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Run Workflow
      `;
    }
  }
}

/**
 * Update node status in the graph visualization
 */
function updateNodeStatus(nodeId, status) {
  window.nodeStatuses[nodeId] = status;
  
  const graphContainer = document.getElementById("workflowGraph");
  if (!graphContainer) return;
  
  const nodeElement = graphContainer.querySelector(`[data-node-id="${nodeId}"]`);
  if (nodeElement) {
    // Remove all status classes
    nodeElement.classList.remove("running", "completed", "error");
    
    // Add new status class
    if (status) {
      nodeElement.classList.add(status);
    }
  }
}

/**
 * Handle preview update - shows intermediate results during execution
 */
function handlePreviewUpdate(update) {
  console.log("Preview update:", update);
  window.previewResults[update.nodeId] = update.value;
  
  // Show preview status indicator
  const previewStatus = document.getElementById("previewStatus");
  if (previewStatus) {
    previewStatus.style.display = "inline-flex";
  }
  
  // Update the UI with preview data
  updatePreviewField(update.nodeId, update.value);
}

/**
 * Handle output update - shows final output results
 */
function handleOutputUpdate(update) {
  console.log("Output update:", update);
  window.outputResults[update.nodeId] = update.value;
  
  // Update the UI with output data
  updateResultField(update.nodeId, update.value, "output");
}

/**
 * Handle job update - updates job status
 */
function handleJobUpdate(update) {
  console.log("Job update:", update);
  
  if (update.status === "running") {
    updateOutput(`Job started: ${update.job_id}`, "info");
  } else if (update.status === "completed") {
    updateOutput("Job completed!", "success");
  } else if (update.status === "failed") {
    updateOutput(`Job failed: ${update.error || "Unknown error"}`, "error");
  } else if (update.status === "cancelled") {
    updateOutput("Job cancelled", "warning");
  } else if (update.status === "suspended") {
    updateOutput(`Job suspended: ${update.message || "Waiting for input"}`, "warning");
  }
}

/**
 * Handle node update - updates node status
 */
function handleNodeUpdate(update) {
  console.log("Node update:", update);
  
  if (update.error) {
    updateOutput(`Node "${update.nodeName || update.nodeId}" error: ${update.error}`, "error");
    updateNodeStatus(update.nodeId, "error");
  } else if (update.status) {
    updateOutput(`Node "${update.nodeName || update.nodeId}": ${update.status}`, "info");
    // Map status to graph status
    let graphStatus = null;
    if (update.status === "running") {
      graphStatus = "running";
    } else if (update.status === "completed") {
      graphStatus = "completed";
    } else if (update.status === "booting" || update.status === "queued") {
      graphStatus = "running";
    }
    if (graphStatus) {
      updateNodeStatus(update.nodeId, graphStatus);
    }
  }
}

/**
 * Update a preview field in the previews section
 */
function updatePreviewField(nodeId, value) {
  const previewsContainer = document.getElementById("previews");
  if (!previewsContainer) return;
  
  // Check if this preview already exists
  let previewCard = document.querySelector(`[data-preview-node="${nodeId}"]`);
  
  if (!previewCard) {
    // Remove empty state if it exists
    const emptyState = previewsContainer.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
    }
    
    // Create new preview card
    previewCard = document.createElement("div");
    previewCard.className = "output-field";
    previewCard.dataset.previewNode = nodeId;
    
    const label = document.createElement("div");
    label.className = "output-field-label";
    label.textContent = `Preview: ${nodeId}`;
    
    const content = document.createElement("div");
    content.className = "output-field-content preview-content";
    
    previewCard.appendChild(label);
    previewCard.appendChild(content);
    previewsContainer.appendChild(previewCard);
  }
  
  // Update the content
  const content = previewCard.querySelector(".preview-content");
  if (content) {
    displayValue(content, value);
    
    // Add animation for updates
    previewCard.style.animation = "none";
    previewCard.offsetHeight; // Trigger reflow
    previewCard.style.animation = "fadeSlideIn 0.3s ease";
  }
}

/**
 * Update a specific result field in the UI
 */
function updateResultField(nodeId, value, type) {
  const resultsContainer = document.getElementById("results");
  if (!resultsContainer) return;
  
  const outputFields = resultsContainer.querySelectorAll(".output-field");
  
  outputFields.forEach((field) => {
    const label = field.querySelector(".output-field-label");
    if (!label) return;
    
    const labelText = label.textContent.trim();
    
    // Match by node ID or label
    if (labelText === nodeId || field.dataset.nodeId === nodeId) {
      const placeholder = field.querySelector('[class*="-placeholder"]') || 
                         field.querySelector("audio") || 
                         field.querySelector("video");
      
      if (placeholder) {
        displayValue(placeholder, value);
        
        // Add animation for updates
        field.style.animation = "none";
        field.offsetHeight; // Trigger reflow
        field.style.animation = "fadeSlideIn 0.3s ease";
      }
    }
  });
}

function initApp() {
  workflowRunner = new WorkflowRunner(apiUrl, workerUrl);
  
  // Set up handlers
  workflowRunner.onProgress = (progress) => {
    updateProgress(progress);
  };
  
  workflowRunner.onMessage = (message) => {
    updateWsMessages(JSON.stringify(message, null, 2));
    if (message.type === "progress_update") {
      updateProgress(message.progress);
    }
  };
  
  workflowRunner.onOutputUpdate = handleOutputUpdate;
  workflowRunner.onPreviewUpdate = handlePreviewUpdate;
  workflowRunner.onJobUpdate = handleJobUpdate;
  workflowRunner.onNodeUpdate = handleNodeUpdate;
  workflowRunner.onError = (error) => {
    updateOutput("Error: " + error, "error");
  };
  
  runWorkflowBtn = document.getElementById("runWorkflowBtn");
  
  const workflowForm = document.getElementById("workflowForm");
  if (workflowForm) {
    workflowForm.style.display = "none";
  }

  const toggleLogsBtn = document.getElementById("toggleLogsBtn");
  const rightContainer = document.querySelector(".right-container");
  const middleContainer = document.querySelector(".middle-container");
  
  const toggleIcon = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="12" x2="21" y2="12"></line>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>
  `;
  const hideIcon = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>
  `;

  if (toggleLogsBtn && rightContainer) {
    toggleLogsBtn.addEventListener("click", () => {
      rightContainer.classList.toggle("hidden");
      if (middleContainer) {
        middleContainer.classList.toggle("expanded");
      }
      const isHidden = rightContainer.classList.contains("hidden");
      toggleLogsBtn.innerHTML = isHidden ? `${hideIcon} Show Logs` : `${toggleIcon} Hide Logs`;
    });
  }

  if (runWorkflowBtn) {
    runWorkflowBtn.addEventListener("click", runSelectedWorkflow);
  }
  
  setTimeout(() => {
    loadWorkflows();
  }, 100);
}

document.addEventListener("DOMContentLoaded", initApp);
