function createWorkflowSelectionWidget(data) {
  const workflowList = document.getElementById("workflowList");
  const searchInput = document.getElementById("workflowSearch");
  let allWorkflows = Array.isArray(data) ? data : data.workflows;

  if (!Array.isArray(allWorkflows)) {
    console.error("Invalid data structure:", data);
    workflowList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>Error loading workflows</p>
      </div>
    `;
    return;
  }

  function renderWorkflows(workflowsToRender) {
    workflowList.innerHTML = "";
    
    if (workflowsToRender.length === 0) {
      workflowList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <p>No workflows found</p>
        </div>
      `;
      return;
    }

    workflowsToRender.forEach((workflow, index) => {
      const workflowItem = document.createElement("div");
      workflowItem.className = "workflow-item";
      workflowItem.dataset.id = workflow.id;
      workflowItem.style.animationDelay = `${index * 50}ms`;
      
      const icon = document.createElement("div");
      icon.className = "workflow-item-icon";
      icon.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
      `;
      
      const content = document.createElement("div");
      content.className = "workflow-item-content";
      
      const name = document.createElement("div");
      name.className = "workflow-item-name";
      name.textContent = workflow.name;
      
      const description = document.createElement("div");
      description.className = "workflow-item-description";
      description.textContent = workflow.description || "Click to view details";
      
      content.appendChild(name);
      content.appendChild(description);
      workflowItem.appendChild(icon);
      workflowItem.appendChild(content);
      
      workflowItem.addEventListener("click", () => {
        workflowList
          .querySelectorAll(".workflow-item")
          .forEach((el) => el.classList.remove("selected"));
        workflowItem.classList.add("selected");
        selectWorkflow(workflow.id);
      });
      
      workflowList.appendChild(workflowItem);
    });
  }

  renderWorkflows(allWorkflows);

  let searchTimeout;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const searchTerm = e.target.value.toLowerCase();
      const filteredWorkflows = searchTerm
        ? allWorkflows.filter((workflow) =>
            workflow.name.toLowerCase().includes(searchTerm) ||
            (workflow.description && workflow.description.toLowerCase().includes(searchTerm))
          )
        : allWorkflows;
      renderWorkflows(filteredWorkflows);
    }, 200);
  });

  document.getElementById("workflowSelectContainer").style.display = "block";
}

function generateInputFields(schema, container) {
  container.innerHTML = "";

  if (
    !schema ||
    !schema.properties ||
    Object.keys(schema.properties).length === 0
  ) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
          <line x1="9" y1="9" x2="9.01" y2="9"></line>
          <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
        <p style="font-size: 0.875rem; color: var(--text-muted);">No inputs required</p>
      </div>
    `;
    return;
  }

  for (const [key, value] of Object.entries(schema.properties)) {
    const fieldWrapper = document.createElement("div");
    fieldWrapper.className = "input-field";
    fieldWrapper.style.animation = "fadeSlideIn 0.3s ease";

    const fieldHeader = document.createElement("div");
    fieldHeader.className = "field-header";

    const label = document.createElement("label");
    label.textContent = value.label || key;
    label.setAttribute("for", key);

    const typeBadge = document.createElement("span");
    typeBadge.className = "field-type";
    typeBadge.textContent = value.type;

    fieldHeader.appendChild(label);
    fieldHeader.appendChild(typeBadge);
    fieldWrapper.appendChild(fieldHeader);

    let input;
    if (value.type === "string") {
      input = document.createElement("textarea");
      input.rows = 3;
      input.placeholder = value.description || `Enter ${key}...`;
    } else if (value.type === "integer" || value.type === "number") {
      if (value.minimum !== undefined && value.maximum !== undefined) {
        const wrapper = document.createElement("div");
        wrapper.className = "range-wrapper";

        const rangeInput = document.createElement("input");
        rangeInput.type = "range";
        rangeInput.min = value.minimum;
        rangeInput.max = value.maximum;
        rangeInput.step = determineStepSize(
          value.minimum,
          value.maximum,
          value.type
        );
        rangeInput.value =
          value.default ||
          (
            (parseFloat(rangeInput.max) + parseFloat(rangeInput.min)) /
            2
          ).toString();

        const numberInput = document.createElement("input");
        numberInput.type = "number";
        numberInput.min = value.minimum;
        numberInput.max = value.maximum;
        numberInput.step = rangeInput.step;
        numberInput.value = rangeInput.value;

        rangeInput.addEventListener("input", (event) => {
          numberInput.value = event.target.value;
        });

        numberInput.addEventListener("input", (event) => {
          rangeInput.value = event.target.value;
        });

        const sliderWrapper = document.createElement("div");
        sliderWrapper.className = "slider-wrapper";

        const min = document.createElement("span");
        min.textContent = value.minimum;
        min.className = "range-min";
        const max = document.createElement("span");
        max.textContent = value.maximum;
        max.className = "range-max";

        sliderWrapper.appendChild(min);
        sliderWrapper.appendChild(rangeInput);
        sliderWrapper.appendChild(max);

        wrapper.appendChild(sliderWrapper);
        wrapper.appendChild(numberInput);
        input = wrapper;
      } else {
        input = document.createElement("input");
        input.type = "number";
        if (value.type === "integer") {
          input.step = "1";
        }
        input.placeholder = value.description || `Enter ${key}...`;
      }
    } else if (value.type === "boolean") {
      const checkboxWrapper = document.createElement("div");
      checkboxWrapper.style.cssText = "display: flex; align-items: center; gap: 0.75rem;";
      
      input = document.createElement("input");
      input.type = "checkbox";
      input.id = key;
      input.name = key;
      input.style.cssText = "width: 20px; height: 20px; accent-color: var(--c-link);";
      
      const checkboxLabel = document.createElement("label");
      checkboxLabel.setAttribute("for", key);
      checkboxLabel.textContent = value.description || value.label || key;
      checkboxLabel.style.marginBottom = "0";
      
      checkboxWrapper.appendChild(input);
      checkboxWrapper.appendChild(checkboxLabel);
      fieldWrapper.appendChild(checkboxWrapper);
    } else {
      input = document.createElement("textarea");
      input.rows = 3;
      input.placeholder = value.description || `Enter ${key}...`;
    }

    if (input.tagName !== "DIV" || input.tagName === "TEXTAREA") {
      input.id = key;
      input.name = key;
    } else {
      const actualInput = input.querySelector("input");
      if (actualInput) {
        actualInput.id = key;
        actualInput.name = key;
      }
    }

    if (schema.required && schema.required.includes(key) && input.tagName !== "DIV") {
      input.required = true;
    }

    if (input.tagName !== "DIV") {
      fieldWrapper.appendChild(input);
    }
    
    container.appendChild(fieldWrapper);
  }
}

function determineStepSize(min, max, type) {
  const range = max - min;
  if (type === "integer") {
    return "1";
  } else {
    if (range <= 1) {
      return "0.01";
    } else if (range <= 10) {
      return "0.1";
    } else if (range <= 100) {
      return "1";
    } else {
      return Math.pow(10, Math.floor(Math.log10(range)) - 2).toString();
    }
  }
}

function generateOutputFields(outputSchema, resultsContainer) {
  resultsContainer.innerHTML = "";

  if (
    !outputSchema ||
    !outputSchema.properties ||
    Object.keys(outputSchema.properties).length === 0
  ) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        <p>Run a workflow to see results</p>
      </div>
    `;
    return;
  }

  for (const [key, value] of Object.entries(outputSchema.properties)) {
    const outputDiv = document.createElement("div");
    outputDiv.className = "output-field";
    outputDiv.dataset.nodeId = key;
    outputDiv.dataset.type = value.type || "string";

    const label = document.createElement("div");
    label.className = "output-field-label";
    label.textContent = value.label || key;
    outputDiv.appendChild(label);

    let placeholder;
    if (value.type === "object" && value.properties?.type?.const === "image") {
      placeholder = document.createElement("div");
      placeholder.className = "image-placeholder";
    } else if (
      value.type === "object" &&
      value.properties?.type?.const === "audio"
    ) {
      placeholder = document.createElement("audio");
      placeholder.className = "audio-placeholder";
      placeholder.controls = true;
    } else if (
      value.type === "object" &&
      value.properties?.type?.const === "video"
    ) {
      placeholder = document.createElement("video");
      placeholder.className = "video-placeholder";
      placeholder.controls = true;
    } else if (value.type === "string") {
      placeholder = document.createElement("pre");
      placeholder.className = "string-placeholder";
      placeholder.textContent = "";
    } else if (value.type === "number" || value.type === "integer") {
      placeholder = document.createElement("pre");
      placeholder.className = "number-placeholder";
      placeholder.textContent = "";
    } else if (value.type === "boolean") {
      placeholder = document.createElement("pre");
      placeholder.className = "boolean-placeholder";
      placeholder.textContent = "";
    } else if (value.type === "array") {
      placeholder = document.createElement("pre");
      placeholder.className = "array-placeholder";
      placeholder.textContent = "[]";
    } else {
      placeholder = document.createElement("pre");
      placeholder.className = "object-placeholder";
      placeholder.textContent = "{}";
    }
    outputDiv.appendChild(placeholder);

    resultsContainer.appendChild(outputDiv);
  }
}

/**
 * Display a value in a placeholder element
 * @param {HTMLElement} placeholder - The placeholder element
 * @param {any} value - The value to display
 */
function displayValue(placeholder, value) {
  if (value === undefined || value === null) {
    placeholder.textContent = "No data available";
    placeholder.classList.add("text-muted");
    return;
  }

  if (typeof value === "object") {
    // Handle image data
    if (value.type === "image" && value.data) {
      const img = document.createElement("img");
      const data = new Uint8Array(value.data);
      const blob = new Blob([data], { type: "image/png" });
      img.src = URL.createObjectURL(blob);
      img.style.cssText = "max-width: 100%; border-radius: var(--rounded-buttonSmall); animation: fadeIn 0.3s ease;";
      placeholder.innerHTML = "";
      placeholder.appendChild(img);
    } 
    // Handle audio data
    else if (value.type === "audio" && value.data) {
      const audio = placeholder.tagName === "AUDIO" ? placeholder : document.createElement("audio");
      audio.className = "audio-placeholder";
      audio.controls = true;
      const data = new Uint8Array(value.data);
      const blob = new Blob([data], { type: "audio/mpeg" });
      audio.src = URL.createObjectURL(blob);
      if (placeholder !== audio) {
        placeholder.innerHTML = "";
        placeholder.appendChild(audio);
      }
    } 
    // Handle video data
    else if (value.type === "video" && value.data) {
      const video = placeholder.tagName === "VIDEO" ? placeholder : document.createElement("video");
      video.className = "video-placeholder";
      video.controls = true;
      const data = new Uint8Array(value.data);
      const blob = new Blob([data], { type: "video/mp4" });
      video.src = URL.createObjectURL(blob);
      if (placeholder !== video) {
        placeholder.innerHTML = "";
        placeholder.appendChild(video);
      }
    } 
    // Handle other objects
    else {
      placeholder.textContent = JSON.stringify(value, null, 2);
      placeholder.classList.remove("text-muted");
    }
  } else {
    // Handle primitive values
    placeholder.textContent = String(value);
    placeholder.classList.remove("text-muted");
  }
}

// Expose functions globally
window.displayValue = displayValue;

document
  .getElementById("workflowForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const selectedWorkflow = document.querySelector(".workflow-item.selected");
    if (!selectedWorkflow) {
      updateOutput("Please select a workflow before running.", "warning");
      return;
    }

    const workflowId = selectedWorkflow.dataset.id;
    const workflow = workflows.find((w) => w.id === workflowId);
    if (!workflow) {
      updateOutput("Selected workflow not found.", "error");
      return;
    }

    const params = getInputValues(workflow.input_schema);
    if (!params) {
      updateOutput("Failed to retrieve input values.", "error");
      return;
    }

    const runWorkflowBtn = document.getElementById("runWorkflowBtn");
    runWorkflowBtn.disabled = true;
    runWorkflowBtn.innerHTML = `
      <span class="spinner spinner-sm"></span>
      Running...
    `;

    try {
      const result = await runWorkflow(workflowRunner, workflowId, params);
      handleResult(result);
    } catch (error) {
      console.error("Error running workflow:", error);
    } finally {
      runWorkflowBtn.disabled = false;
      runWorkflowBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Run Workflow
      `;
    }
  });

function handleResult(result) {
  const resultsContainer = document.getElementById("results");
  const outputFields = resultsContainer.querySelectorAll(".output-field");

  if (!result || typeof result !== "object") {
    console.error("Invalid result:", result);
    updateOutput("Error: Received invalid result from the workflow", "error");
    outputFields.forEach((field) => {
      const placeholder = field.querySelector('[class*="-placeholder"]');
      if (placeholder) {
        placeholder.textContent = "No data available";
        placeholder.classList.add("text-muted");
      }
    });
    return;
  }

  outputFields.forEach((field) => {
    const label = field.querySelector(".output-field-label");
    if (!label) return;
    
    const labelText = label.textContent.trim();
    let outputValue = result[labelText];

    // Also check by nodeId if set
    if (outputValue === undefined && field.dataset.nodeId) {
      outputValue = result[field.dataset.nodeId];
    }

    const placeholder = field.querySelector('[class*="-placeholder"]') || field.querySelector("audio") || field.querySelector("video");

    if (outputValue === undefined || outputValue === null) {
      if (placeholder) {
        placeholder.textContent = "No data available";
        placeholder.classList.add("text-muted");
      }
      return;
    }

    displayValue(placeholder, outputValue);
  });

  console.log("Full result object:", result);
  updateOutput("Workflow completed successfully", "success");
}
