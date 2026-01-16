# Workflow Runner Mini-App Guide

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Workflow Runner**

This guide helps AI agents understand the standalone workflow runner mini-application.

## Overview

The workflow runner is a lightweight, standalone HTML/JavaScript application that can execute NodeTool workflows without the full editor interface. It's designed for:
- Embedding workflows in other applications
- Running workflows as simple web apps
- Sharing workflows with non-technical users
- Testing workflows in isolation

## File Structure

```
/workflow_runner
├── index.html       # Main HTML page
├── /js              # JavaScript files
│   └── runner.js    # Workflow execution logic
├── /styles          # CSS styles
│   └── runner.css   # Application styles
├── nodetool_logo.png # Logo asset
└── README.md        # Usage instructions
```

## Key Files

### index.html

The main HTML page provides:
- Workflow selection UI
- Input form for workflow parameters
- Output display area
- Progress indicators
- Error handling UI

Basic structure:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NodeTool Workflow Runner</title>
    <link rel="stylesheet" href="styles/runner.css">
</head>
<body>
    <div id="app">
        <header>
            <img src="nodetool_logo.png" alt="NodeTool" />
            <h1>Workflow Runner</h1>
        </header>
        
        <main>
            <!-- Workflow selector -->
            <div id="workflow-selector"></div>
            
            <!-- Input form -->
            <div id="input-form"></div>
            
            <!-- Run button -->
            <button id="run-button">Run Workflow</button>
            
            <!-- Progress -->
            <div id="progress"></div>
            
            <!-- Results -->
            <div id="results"></div>
        </main>
    </div>
    
    <script src="js/runner.js"></script>
</body>
</html>
```

### js/runner.js

The JavaScript handles:
- Loading workflow definitions
- Building input forms
- Executing workflows via API
- Displaying results
- Error handling

Basic structure:
```javascript
class WorkflowRunner {
  constructor() {
    this.apiUrl = this.getApiUrl();
    this.workflowId = this.getWorkflowIdFromUrl();
    this.ws = null;
  }
  
  getApiUrl() {
    // Get API URL from environment or default
    // For development: use port 7777 (nodetool serve)
    // For production: use port 8000 (nodetool serve --production) or your server URL
    return window.NODETOOL_API_URL || 'http://localhost:7777';
  }
  
  getWorkflowIdFromUrl() {
    // Extract workflow ID from URL query params
    const params = new URLSearchParams(window.location.search);
    return params.get('workflow');
  }
  
  async loadWorkflow(workflowId) {
    // Fetch workflow definition from API
    const response = await fetch(`${this.apiUrl}/api/workflows/${workflowId}`);
    return await response.json();
  }
  
  buildInputForm(workflow) {
    // Generate HTML form for workflow inputs
    const form = document.getElementById('input-form');
    
    workflow.inputs.forEach(input => {
      const field = this.createInputField(input);
      form.appendChild(field);
    });
  }
  
  createInputField(input) {
    // Create appropriate input element based on type
    const container = document.createElement('div');
    container.className = 'input-field';
    
    const label = document.createElement('label');
    label.textContent = input.name;
    container.appendChild(label);
    
    let element;
    switch (input.type) {
      case 'string':
        element = document.createElement('input');
        element.type = 'text';
        break;
      case 'int':
      case 'float':
        element = document.createElement('input');
        element.type = 'number';
        break;
      case 'bool':
        element = document.createElement('input');
        element.type = 'checkbox';
        break;
      case 'image':
        element = document.createElement('input');
        element.type = 'file';
        element.accept = 'image/*';
        break;
      default:
        element = document.createElement('input');
    }
    
    element.id = input.name;
    element.name = input.name;
    container.appendChild(element);
    
    return container;
  }
  
  async runWorkflow(inputs) {
    // Connect to WebSocket for real-time updates
    this.connectWebSocket();
    
    // Send workflow execution request
    const response = await fetch(`${this.apiUrl}/api/workflows/${this.workflowId}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs })
    });
    
    const result = await response.json();
    return result;
  }
  
  connectWebSocket() {
    const wsUrl = this.apiUrl.replace('http', 'ws') + '/ws';
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleWorkflowUpdate(message);
    };
  }
  
  handleWorkflowUpdate(message) {
    switch (message.type) {
      case 'progress':
        this.updateProgress(message.progress);
        break;
      case 'result':
        this.displayResult(message.result);
        break;
      case 'error':
        this.displayError(message.error);
        break;
    }
  }
  
  updateProgress(progress) {
    const progressBar = document.getElementById('progress');
    progressBar.style.width = `${progress}%`;
  }
  
  displayResult(result) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';
    
    // Display each output
    Object.entries(result).forEach(([key, value]) => {
      const output = this.createOutputElement(key, value);
      resultsDiv.appendChild(output);
    });
  }
  
  createOutputElement(name, value) {
    const container = document.createElement('div');
    container.className = 'output';
    
    const label = document.createElement('h3');
    label.textContent = name;
    container.appendChild(label);
    
    // Handle different output types
    if (typeof value === 'string' && value.startsWith('data:image')) {
      const img = document.createElement('img');
      img.src = value;
      container.appendChild(img);
    } else if (typeof value === 'object') {
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(value, null, 2);
      container.appendChild(pre);
    } else {
      const p = document.createElement('p');
      p.textContent = value;
      container.appendChild(p);
    }
    
    return container;
  }
  
  displayError(error) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `<div class="error">${error}</div>`;
  }
}

// Initialize runner when page loads
document.addEventListener('DOMContentLoaded', () => {
  const runner = new WorkflowRunner();
  
  // Load workflow if ID provided
  if (runner.workflowId) {
    runner.loadWorkflow(runner.workflowId).then(workflow => {
      runner.buildInputForm(workflow);
    });
  }
  
  // Handle run button click
  document.getElementById('run-button').addEventListener('click', async () => {
    const inputs = runner.collectInputs();
    await runner.runWorkflow(inputs);
  });
});
```

### styles/runner.css

Styling for the runner interface:
```css
:root {
  --primary-color: #6366f1;
  --background-color: #ffffff;
  --text-color: #1f2937;
  --border-color: #e5e7eb;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  margin: 0;
  padding: 0;
  background-color: var(--background-color);
  color: var(--text-color);
}

#app {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

header {
  text-align: center;
  margin-bottom: 2rem;
}

header img {
  height: 48px;
}

.input-field {
  margin-bottom: 1rem;
}

.input-field label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.input-field input,
.input-field select,
.input-field textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

#run-button {
  background-color: var(--primary-color);
  color: white;
  padding: 0.75rem 2rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  width: 100%;
}

#run-button:hover {
  opacity: 0.9;
}

#progress {
  height: 4px;
  background-color: var(--primary-color);
  width: 0%;
  transition: width 0.3s;
  margin: 1rem 0;
}

.output {
  background-color: #f9fafb;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.output img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.error {
  background-color: #fef2f2;
  color: #dc2626;
  padding: 1rem;
  border-radius: 4px;
  border-left: 4px solid #dc2626;
}
```

## Usage

### Embedding in Webpage

```html
<iframe 
  src="https://your-domain.com/workflow_runner/?workflow=workflow-id"
  width="100%"
  height="600"
  frameborder="0"
></iframe>
```

### Standalone Usage

```
https://your-domain.com/workflow_runner/?workflow=workflow-id
```

### Configuration

Configure via URL parameters or environment variables:

```javascript
// In runner.js
const config = {
  // For development use port 7777, for production use port 8000 or your server URL
  apiUrl: window.NODETOOL_API_URL || 'http://localhost:7777',
  workflowId: getUrlParam('workflow'),
  theme: getUrlParam('theme') || 'light',
  showHeader: getUrlParam('showHeader') !== 'false'
};
```

## Best Practices

1. **Security**: Validate all inputs before sending to API
2. **Error Handling**: Display user-friendly error messages
3. **Loading States**: Show progress indicators
4. **Responsive Design**: Support mobile devices
5. **Accessibility**: Use semantic HTML and ARIA labels

## Related Documentation

- [Root AGENTS.md](../AGENTS.md) - Project overview
- [Web UI Guide](../web/src/AGENTS.md) - Full editor
- [API Documentation](../docs/api-reference.md) - API reference

---

**Note**: This guide is for AI coding assistants. For user documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
