function createWorkflowSelectionWidget(data) {
  const workflowList = document.getElementById("workflowList");
  const searchInput = document.getElementById("workflowSearch");
  let allWorkflows = Array.isArray(data) ? data : data.workflows;

  if (!Array.isArray(allWorkflows)) {
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

  renderWorkflows(allWorkflows);

  searchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredWorkflows = searchTerm
      ? allWorkflows.filter((workflow) =>
          workflow.name.toLowerCase().includes(searchTerm)
        )
      : allWorkflows;
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
    label.textContent = value.title || key;
    label.setAttribute("for", key);

    let input;
    if (value.type === "string") {
      input = document.createElement("textarea");
      input.rows = 3;
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
          console.log("Slider value changed:", event.target.value);
        });

        numberInput.addEventListener("input", (event) => {
          rangeInput.value = event.target.value;
          console.log("Number input value changed:", event.target.value);
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
    resultsContainer.innerHTML = "<p>No output fields for this workflow.</p>";
    return;
  }

  for (const [key, value] of Object.entries(outputSchema.properties)) {
    const outputDiv = document.createElement("div");
    outputDiv.className = "output-field";

    const label = document.createElement("label");
    label.textContent = key;
    outputDiv.appendChild(label);

    let placeholder;
    if (value.type === "object" && value.properties.type?.const === "image") {
      placeholder = document.createElement("div");
      placeholder.className = "image-placeholder";
    } else if (
      value.type === "object" &&
      value.properties.type?.const === "audio"
    ) {
      placeholder = document.createElement("audio");
      placeholder.className = "audio-placeholder";
      placeholder.controls = true;
    } else if (
      value.type === "object" &&
      value.properties.type?.const === "video"
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
      placeholder.textContent = "Number";
    } else if (value.type === "boolean") {
      placeholder = document.createElement("pre");
      placeholder.className = "boolean-placeholder";
      placeholder.textContent = "Boolean";
    } else if (value.type === "array") {
      placeholder = document.createElement("pre");
      placeholder.className = "array-placeholder";
      placeholder.textContent = "Array";
    } else {
      placeholder = document.createElement("pre");
      placeholder.className = "object-placeholder";
      placeholder.textContent = "Object";
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
    if (!workflow) {
      updateOutput("Selected workflow not found.");
      return;
    }

    const params = getInputValues(workflow.input_schema);
    if (!params) {
      updateOutput("Failed to retrieve input values.");
      return;
    }

    const runWorkflowBtn = document.getElementById("runWorkflowBtn");
    runWorkflowBtn.disabled = true;

    try {
      const result = await runWorkflow(workflowRunner, workflowId, params);
      handleResult(result);
    } catch (error) {
      console.error("Error running workflow:", error);
    } finally {
      runWorkflowBtn.disabled = false;
    }
  });

function handleResult(result) {
  const resultsContainer = document.getElementById("results");
  const outputFields = resultsContainer.querySelectorAll(".output-field");

  if (!result || typeof result !== "object") {
    console.error("Invalid result:", result);
    updateOutput("Error: Received invalid result from the workflow");
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
