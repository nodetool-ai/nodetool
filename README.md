<h1 style="display: inline;">
  <img src="https://github.com/user-attachments/assets/823b1091-78cd-423f-9b41-14f33b787c7d" alt="NodeTool Logo" height="24" style="vertical-align: -30px;"/>
  NodeTool - Your Creative AI Playground
</h1>

NodeTool is the ultimate platform for AI enthusiasts, innovators, and creators. It brings together a wide range of AI tools and models in a simple, visual interface. Whether you're an artist, developer, data scientist, or complete beginner, NodeTool has everything you need to power your AI projects and bring your ideas to life.

With NodeTool, you can:

- **Prototype ideas quickly**: Experiment with thousands of models in a friendly, visual interface.
- **Run models locally**: Utilize your own GPU to run large language models via Ollama and access hundreds of models via Hugging Face Transformers and Diffusers.
- **Leverage cloud services**: Outsource heavy GPU workloads to services like Replicate, OpenAI, and Anthropic for powerful model access without expensive hardware.

![NodeTool](nodetool.png)

NodeTool simplifies access to advanced AI technologies, providing a creative space for both newcomers and experienced users to build powerful solutions for content creation, data analysis, automation, and more.

## Features ✨

- **Visual Editor | No-Code Development**: Create complex AI workflows visually—no coding needed! Dive into an intuitive, node-based design and let your creativity flow.
- **Seamless Integration with Leading AI Platforms**: Mix and match models from OpenAI, Hugging Face, Anthropic, Ollama, and ComfyUI for endless possibilities.
- **Model Manager**: Browse and manage your favorite models locally. Download recommended models directly from the Hugging Face Hub and run them on your GPU.
- **Asset Browser**: Easily import and manage media assets to use in your AI creations.
- **ComfyUI Integration**: Bring in ComfyUI workflows and nodes to expand your playground.
- **Multimodal Support**: Play with images, text, audio, video, and more — all in one place.
- **API Integration**: Connect your AI tools with websites or apps seamlessly.
- **Dual Model Execution Modes**:
  - **Local Execution**: Run models locally using Ollama and Hugging Face, leveraging your own hardware.
  - **Remote Execution**: Outsource processing to cloud services like Replicate, OpenAI, and Anthropic.
- **Customizable Nodes**: Extend functionality with Python.
- **Real-Time Execution**: WebSocket-based architecture for live processing.
- **Cross-Platform Compatibility**: Available as standalone app on Mac and Windows.

## Quickstart 🚀

Download the latest release from our [Releases Page](https://github.com/nodetool-ai/nodetool/releases).

## Use Cases 🎨

- 🎨 **Image Generation**: Craft custom image pipelines from scratch.
- 🎶 **Music Generation**: Generate musical pieces based on text descriptions or themes.
- 🔊 **Sound-to-Visual Art**: Turn audio into visual masterpieces.
- 📚 **Audio-to-Story Generator**: Create stories inspired by sounds.
- ✨ **Image Enhancement**: Improve image quality with AI-powered techniques.
- 🌍 **Multilingual Content Creation**: Create and translate content across multiple languages.
- 📊 **Data Visualization**: Turn complex data into intuitive visuals.

## Node Overview 🧩

NodeTool offers a diverse range of nodes to support various AI tasks, integrating smoothly with platforms like OpenAI, Hugging Face, Anthropic, Ollama, and ComfyUI. Nodes are organized into categories:

### Node Categories

- **Anthropic** (`anthropic`): Text-based AI operations using Anthropic's models.
- **HuggingFace** (`huggingface`): Comprehensive AI capabilities including audio, image, text, video, and multimodal processing.
- **NodeTool Core** (`nodetool`): Core functionalities for data manipulation, I/O operations, and various media processing.
- **Ollama** (`ollama`): Run local large language models directly on your machine.
- **OpenAI** (`openai`): AI operations for audio, image, and text using OpenAI's models.
- **Replicate** (`replicate`): Versatile AI capabilities for audio, image, text, and video processing via cloud execution.
- **Stable Diffusion** (`stable_diffusion`): Specialized image generation and manipulation.
- **ComfyUI** (`comfyui`): Integration with ComfyUI for advanced image processing workflows.

## Model Manager 🗂️

NodeTool's Model Manager simplifies handling AI models:

- **Browse Cached Models**: View and manage models already downloaded to your local machine.
- **Download Recommended Models**: Easily access and download popular models from the Hugging Face Hub.
- **Efficient Storage**: Manage disk space by selectively caching frequently used models.
- **Seamless Integration**: Downloaded models are immediately available within your workflows.

## Architecture 🏗️

NodeTool's architecture is designed to be flexible and extensible.

```mermaid
graph TD
A[NodeTool Editor<br>ReactJS] -->|HTTP/WebSocket| B[API Server]
A <-->|WebSocket| C[WebSocket Runner]
B <-->|Internal Communication| C
C <-->|WebSocket| D[Worker with ML Models<br>CPU/GPU<br>Local/Cloud]
D <-->|HTTP Callbacks| B
E[Other Apps/Websites] -->|HTTP| B
E <-->|WebSocket| C
D -->|Optional API Calls| F[OpenAI<br>Replicate<br>Anthropic<br>Others]

    classDef default fill:#e0eee0,stroke:#333,stroke-width:2px,color:#000;
    classDef frontend fill:#ffcccc,stroke:#333,stroke-width:2px,color:#000;
    classDef server fill:#cce5ff,stroke:#333,stroke-width:2px,color:#000;
    classDef runner fill:#ccffe5,stroke:#333,stroke-width:2px,color:#000;
    classDef worker fill:#ccf2ff,stroke:#333,stroke-width:2px,color:#000;
    classDef api fill:#e0e0e0,stroke:#333,stroke-width:2px,color:#000;
    classDef darkgray fill:#a9a9a9,stroke:#333,stroke-width:2px,color:#000;

    class A frontend;
    class B server;
    class C runner;
    class D worker;
    class E other;
    class F api;
```

### Components Overview

1. **🖥️ Frontend**: NodeTool Editor for workflows, assets, models. Built with ReactJS, Reactflow, MUI v5, TypeScript.
2. **🌐 API Server**: Handles HTTP and WebSocket connections from the frontend, managing user sessions, workflow storage, and coordination between components.
3. **🔌 WebSocket Runner**: Executes workflows in real-time, maintaining the state of running workflows and managing communication between nodes.
4. **⚙️ Worker**: Performs the actual processing of individual nodes, allowing for parallel execution and scalability. It integrates seamlessly with:

   - **Local Models**: Run models locally using Ollama and Hugging Face Transformers and Diffusers.
   - **Remote Services**: Call external APIs like OpenAI, Replicate, Anthropic, and others for heavy GPU workloads.

### Data Flow 🔄

1. **User Interaction**: Create and modify workflows through the intuitive React frontend.
2. **Workflow Management**: Frontend sends workflow data to the API server for storage and execution.
3. **Execution Delegation**: API server hands off workflow execution to the WebSocket Runner.
4. **Node Coordination**: WebSocket Runner orchestrates node execution across Workers.
5. **Real-Time Feedback**: Results stream back to the frontend via WebSocket for instant updates.

## Implementing Custom Nodes 🛠️

Extend NodeTool's functionality by creating custom nodes that can integrate models from your preferred platforms:

```python
class MyAgent(BaseNode):
    prompt: Field(default="Build me a website for my business.")

    async def process(self, context: ProcessingContext) -> str:
        llm = MyLLM()
        return llm.generate(self.prompt)
```

## Using the Workflow API 🔌

NodeTool provides a powerful Workflow API that allows you to integrate and run your AI workflows programmatically.

You can use the API locally now, `api.nodetool.ai` access is limited to Alpha users.

### API Usage

#### Loading Workflows

```javascript
const response = await fetch("http://localhost:8000/api/workflows/");
const workflows = await response.json();
```

#### Running a Workflow

##### HTTP API

```bash
curl -X POST "http://localhost:8000/api/jobs/run" \
-H "Content-Type: application/json" \
-d '{
    "workflow_id": "your_workflow_id"
}'
```

```javascript
const response = await fetch("http://localhost:8000/api/jobs/run", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    workflow_id: workflowId,
    params: params,
  }),
});

const outputs = await response.json();
// outputs is an object with one property for each output node in the workflow
// the value is the output of the node, which can be a string, image, audio, etc.
```

#### Streaming API

The streaming API is useful for getting real-time updates on the status of the workflow.

See [run_workflow_streaming.js](examples/run_workflow_streaming.js) for an example.

These updates include:

- job_update: The overall status of the job (e.g. running, completed, failed, cancelled)
- node_update: The status of a specific node (e.g. running, completed, error)
- node_progress: The progress of a specific node (e.g. 20% complete)

The final result of the workflow is also streamed as a single job_update with the status "completed".

```javascript
const response = await fetch("http://localhost:8000/api/jobs/run?stream=true", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer YOUR_API_TOKEN",
  },
  body: JSON.stringify({
    workflow_id: workflowId,
    params: params,
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split("\n");
  for (const line of lines) {
    if (line.trim() === "") continue;

    const message = JSON.parse(line);
    switch (message.type) {
      case "job_update":
        console.log("Job status:", message.status);
        if (message.status === "completed") {
          console.log("Workflow completed:", message.result);
        }
        break;
      case "node_progress":
        console.log(
          "Node progress:",
          message.node_name,
          (message.progress / message.total) * 100
        );
        break;
      case "node_update":
        console.log(
          "Node update:",
          message.node_name,
          message.status,
          message.error
        );
        break;
    }
  }
}
```

##### WebSocket API

The WebSocket API is useful for getting real-time updates on the status of the workflow.
It is similar to the streaming API, but it uses a more efficient binary encoding.
It offers additional features like canceling jobs.

See [run_workflow_websocket.js](examples/run_workflow_websocket.js) for an example.

```javascript
const socket = new WebSocket("ws://localhost:8000/predict");

const request = {
  type: "run_job_request",
  workflow_id: "YOUR_WORKFLOW_ID",
  params: {
    /* workflow parameters */
  },
};

// Run a workflow
socket.send(
  msgpack.encode({
    command: "run_job",
    data: request,
  })
);

// Handle messages from the server
socket.onmessage = async (event) => {
  const data = msgpack.decode(new Uint8Array(await event.data.arrayBuffer()));
  if (data.type === "job_update" && data.status === "completed") {
    console.log("Workflow completed:", data.result);
  } else if (data.type === "node_update") {
    console.log("Node update:", data.node_name, data.status, data.error);
  } else if (data.type === "node_progress") {
    console.log("Progress:", (data.progress / data.total) * 100);
  }
  // Handle other message types as needed
};

// Cancel a running job
socket.send(msgpack.encode({ command: "cancel_job" }));

// Get the status of the job
socket.send(msgpack.encode({ command: "get_status" }));
```

### API Demo

- Check out this simple [html page](api-demo.html).
- Download the [html file](<(api-demo.html)>)
- Open in a browser locally.
- Select the endpoint, local or api.nodetool.ai (for alpha users)
- Enter API token (from Nodetool settings dialog)
- Select workflow
- Run workflow
- The page will live stream the output from the local or remote API

## Development Setup 🛠️

### Requirements

- Python 3.10+
- Node.js 20+

### Run Backend

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
pip install -r requirements.txt
./scripts/server
```

### Run Frontend

```bash
cd web
npm install
npm start
```

Now, open your browser and navigate to `http://localhost:3000` to access the NodeTool interface.

### Run Electron App

The Electron app starts the frontend and backend.

```bash
cd web
npm install
npm run build
cd ../electron
npm install
npm start
```

### Sync Dependencies

Dependencies are managed in `pyproject.toml` and must be synced to `requirements.txt` using:

```bash
poetry export -f requirements.txt --output requirements.txt --without-hashes
```

## Contributing 🤝

We welcome contributions from the community! To contribute to NodeTool:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/YourFeature`).
3. Commit your changes (`git commit -am 'Add some feature'`).
4. Push to the branch (`git push origin feature/YourFeature`).
5. Open a Pull Request.

Please adhere to our contribution guidelines.

## License 📄

NodeTool is licensed under the [AGPLv3 License](LICENSE.txt)

## Contact 📬

Got ideas, suggestions, or just want to say hi? We'd love to hear from you!

- **Email**: [hello@nodetool.ai](mailto:hello@nodetool.ai)
- **Forum**: [Nodetool Forum](https://forum.nodetool.ai)
- **GitHub**: [https://github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool)
