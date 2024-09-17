<h1 style="display: inline;">
  <img src="https://github.com/user-attachments/assets/823b1091-78cd-423f-9b41-14f33b787c7d" alt="NodeTool Logo" height="24" style="vertical-align: -30px;"/>
  NodeTool
</h1>

NodeTool is an all-in-one platform for AI professionals and innovators. It brings together a wide range of AI tools and models in a simple, visual interface. Whether you're an artist, developer, data scientist or complete beginner, NodeTool has everything you need to power your AI projects.

With NodeTool, you can:

- **Run models locally**: Utilize your own hardware to run large language models via Ollama and access hundreds of models via Hugging Face Transformers and Diffusers. Leverage the ComfyUI ecosystem for advanced image processing workflows.
- **Run models remotely**: Outsource heavy GPU workloads to cloud services like Replicate, OpenAI, and Anthropic, allowing you to leverage powerful models without the need for expensive hardware.

![NodeTool](nodetool.png)

By simplifying access to advanced AI technologies, NodeTool provides a creative space for both newcomers and experienced users to build powerful solutions for content creation, data analysis, automation, and more.

## Features ✨

- **No-Code Development**: Create complex AI workflows without programming knowledge.
- **Visual Editor**: Intuitive, node-based workflow design.
- **Seamless Integration with Leading AI Platforms**: Easily incorporate models from OpenAI, Hugging Face, Anthropic, Ollama, and ComfyUI into your workflows.
- **Dual Model Execution Modes**:
  - **Local Execution**: Run models locally using Ollama and Hugging Face, leveraging your own hardware.
  - **Remote Execution**: Outsource processing to cloud services like Replicate, OpenAI, and Anthropic.
- **Model Manager**: Browse and manage cached local models
- **HuggingFace**: Download models directly from the Hugging Face Hub.
- **Asset Browser**: Import, browse and preview media assets in folders.
- **ComfyUI (alpha)**: Import ComfyUI workflows and nodes into NodeTool.
- **Multimodal Support**: Handle images, text, audio, video, and more in a single workflow.
- **API Integration (alpha)**: Run AI tools from websites or mobile apps.
- **Customizable Nodes**: Extend functionality with Python.
- **Real-Time Execution**: WebSocket-based architecture for live processing.
- **Cross-Platform Compatibility**: Available as standalone app on Mac and Windows.

## Quickstart 🚀

Download the latest release from our [Releases Page](https://github.com/nodetool-ai/nodetool/releases).

### Installation 📦

1. **Download**: Get the latest release from the [Releases Page](https://github.com/nodetool-ai/nodetool/releases).
2. **Extract**: Unzip the downloaded archive.
3. **Install**: Run the installer and follow the instructions.

## Use Cases 🎨

- 🧠 **Combine AI Models**: Explore and creatively combine hundreds of ML models.
- 🎨 **Stable Diffusion**: Generate custom image pipelines from the ground up.
- 🌐 **Run Anywhere**: Create AI tools accessible from websites or mobile apps.
- 🎶 **Music Generation**: Produce musical ideas and compositions based on text descriptions or themes.
- 🔊 **Sound-to-Visual Art**: Transform audio into visual masterpieces.
- 🎧 **Audio-to-Story Generator**: Create stories inspired by audio inputs.
- 🖼️ **Image Enhancement**: Improve image quality with AI-powered techniques.
- 🌍 **Multilingual Content Creation**: Produce and translate content across languages.
- 📊 **Data Visualization**: Turn complex datasets into intuitive, visual representations.

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

Each category contains specific nodes tailored for different AI tasks, allowing users to create complex workflows by combining nodes across these categories.

```
nodes
├── anthropic
│   └── text
├── huggingface
│   ├── audio
│   ├── image
│   ├── multimodal
│   ├── text
│   └── video
├── nodetool
│   ├── agents
│   ├── audio
│   ├── boolean
│   ├── constant
│   ├── dataframe
│   ├── dictionary
│   ├── group
│   ├── http
│   ├── image
│   ├── input
│   ├── list
│   ├── math
│   ├── output
│   ├── tensor
│   ├── text
│   ├── vector
│   └── video
├── ollama
│   └── text
├── openai
│   ├── audio
│   ├── image
│   └── text
├── replicate
│   ├── audio
│   ├── image
│   ├── text
│   └── video
├── stable_diffusion
│   └── image
└── comfyui
    └── image
```

## Model Manager 🗂️

NodeTool includes a **Model Manager** that simplifies the process of handling AI models:

- **Browse Cached Models**: View and manage models that are already downloaded to your local machine.
- **Download Recommended Models**: Easily access and download popular models from the Hugging Face Hub.
- **Efficient Storage**: Manage disk space by selectively caching models you frequently use.
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

## Using the Workflow API (Alpha) 🔌

NodeTool provides a powerful Workflow API that allows you to integrate and run your AI workflows programmatically.

You can use the API locally now, `api.nodetool.ai` access is limited to Alpha users.

### Getting Started

1. **Obtain an API Token**: Log in to your NodeTool account and generate an API token from your user settings.
2. **Connect to the API**:
   - API URL: `https://api.nodetool.ai/api` or `http://localhost:8000/api` for local
   - WebSocket URL: `wss://api.nodetool.ai/predict` or `http://localhost:8000/predict` for local

### API Usage

#### Loading Workflows

```javascript
const response = await fetch("https://api.nodetool.ai/api/workflows", {
  headers: {
    Authorization: "Bearer YOUR_API_TOKEN",
  },
});
const workflows = await response.json();
```

#### Running a Workflow

```javascript
const socket = new WebSocket("wss://api.nodetool.ai/predict");

const request = {
  type: "run_job_request",
  api_url: "https://api.nodetool.ai/api",
  workflow_id: "YOUR_WORKFLOW_ID",
  job_type: "workflow",
  auth_token: "YOUR_API_TOKEN",
  params: {
    /* workflow parameters */
  },
};

socket.send(
  msgpack.encode({
    command: "run_job",
    data: request,
  })
);

socket.onmessage = async (event) => {
  const data = msgpack.decode(new Uint8Array(await event.data.arrayBuffer()));
  if (data.type === "job_update" && data.status === "completed") {
    console.log("Workflow completed:", data.result);
  } else if (data.type === "node_progress") {
    console.log("Progress:", (data.progress / data.total) * 100);
  }
  // Handle other message types as needed
};
```

### API Demo

- Check out this simple [html page](api-demo.html). 
- Download the [html file]((api-demo.html))
- Open in a browser locally.
- Select the endpoint, local or api.nodetool.ai (for alpha users)
- Enter API token (from Nodetool settings dialog)
- Select workflow
- Run workflow
- The page will live stream the output from the local or remote API

### Response Handling

- The API uses MessagePack for efficient data serialization.
- Responses include various types such as job updates, node progress, and results.
- Results may contain different data types (e.g., text, images) based on your workflow output.

By leveraging this API, you can seamlessly integrate NodeTool's powerful AI workflows into your own applications, enabling advanced AI capabilities with minimal code.

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

If you want to run the Electron app:

```bash
cd electron
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

NodeTool is licensed under the [GPLv3 License](LICENSE.txt), promoting open-source collaboration and sharing.

## Contact 📬

For inquiries, suggestions, or contributions, please reach out to the core team:

- **Matthias Georgi**
- **David Bürer**

**GitHub**: [https://github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool)
