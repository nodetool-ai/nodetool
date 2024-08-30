function createWorkflowSelectionWidget(data) {
  const workflowList = document.getElementById("workflowList");
  workflowList.innerHTML = "";

  let workflows = Array.isArray(data) ? data : data.workflows;

  if (!Array.isArray(workflows)) {
    console.error("Invalid data structure:", data);
    workflowList.textContent = "Error: Invalid workflow data structure.";
    return;
  }

  function renderWorkflows(workflowsToRender) {
    workflowList.innerHTML = "";
    workflowsToRender.forEach((workflow) => {
      const workflowItem = document.createElement("div");
      workflowItem.className = "workflow-item";
      workflowItem.dataset.id = workflow.id;
      workflowItem.textContent = workflow.name;
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

  renderWorkflows(workflows);

  const searchInput = document.getElementById("workflowSearch");
  searchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredWorkflows = workflows.filter((workflow) =>
      workflow.name.toLowerCase().includes(searchTerm)
    );
    renderWorkflows(filteredWorkflows);
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
    return;
  }

  for (const [key, value] of Object.entries(schema.properties)) {
    const label = document.createElement("label");
    label.textContent = `${value.title || key}:`;
    label.setAttribute("for", key);

    let input;
    if (value.type === "string") {
      input = document.createElement("textarea");
      input.rows = 3;
    } else if (value.type === "integer" || value.type === "number") {
      if (value.minimum !== undefined && value.maximum !== undefined) {
        const wrapper = document.createElement("div");
        wrapper.className = "range-wrapper";

        input = document.createElement("input");
        input.type = "range";
        input.min = value.minimum;
        input.max = value.maximum;
        input.step = value.type === "integer" ? "1" : "any";

        const valueDisplay = document.createElement("span");
        valueDisplay.className = "range-value";
        valueDisplay.textContent = input.value;

        input.addEventListener("input", () => {
          valueDisplay.textContent = input.value;
        });

        wrapper.appendChild(input);
        wrapper.appendChild(valueDisplay);
        input = wrapper;
      } else {
        input = document.createElement("input");
        input.type = "number";
        if (value.type === "integer") {
          input.step = "1";
        }
      }
    } else if (value.type === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox";
    } else {
      input = document.createElement("textarea");
      input.rows = 3;
    }

    if (input.tagName !== "DIV") {
      input.id = key;
      input.name = key;
    } else {
      input.querySelector("input").id = key;
      input.querySelector("input").name = key;
    }

    if (schema.required && schema.required.includes(key)) {
      input.required = true;
    }

    container.appendChild(label);
    container.appendChild(input);
  }
}

function generateOutputFields(outputSchema, resultsContainer) {
  resultsContainer.innerHTML = "";

  if (
    !outputSchema ||
    !outputSchema.properties ||
    Object.keys(outputSchema.properties).length === 0
  ) {
    resultsContainer.innerHTML = "<p>No output fields for this workflow.</p>";
    return;
  }

  for (const [key, value] of Object.entries(outputSchema.properties)) {
    const outputDiv = document.createElement("div");
    outputDiv.className = "output-field";

    const label = document.createElement("h4");
    label.textContent = key;
    outputDiv.appendChild(label);

    let placeholder;
    if (value.type === "object" && value.properties.type?.const === "image") {
      placeholder = document.createElement("div");
      placeholder.className = "image-placeholder";
    } else if (value.type === "string") {
      placeholder = document.createElement("pre");
      placeholder.className = "string-placeholder";
      placeholder.textContent = "String output will appear here";
    } else if (value.type === "number" || value.type === "integer") {
      placeholder = document.createElement("pre");
      placeholder.className = "number-placeholder";
      placeholder.textContent = "Numeric output will appear here";
    } else if (value.type === "boolean") {
      placeholder = document.createElement("pre");
      placeholder.className = "boolean-placeholder";
      placeholder.textContent = "Boolean output will appear here";
    } else if (value.type === "array") {
      placeholder = document.createElement("pre");
      placeholder.className = "array-placeholder";
      placeholder.textContent = "Array output will appear here";
    } else if (value.type === "object") {
      placeholder = document.createElement("pre");
      placeholder.className = "object-placeholder";
      placeholder.textContent = "Object output will appear here";
    } else {
      placeholder = document.createElement("pre");
      placeholder.className = "unknown-placeholder";
      placeholder.textContent = "Output will appear here";
    }
    outputDiv.appendChild(placeholder);

    resultsContainer.appendChild(outputDiv);
  }
}

document
  .getElementById("workflowForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedWorkflow = document.querySelector(".workflow-item.selected");
    if (!selectedWorkflow) {
      updateOutput("Please select a workflow before running.");
      return;
    }
    const workflowId = selectedWorkflow.dataset.id;
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
