# 🛠️ nodetool

NodeTool is a powerful no-code development environment for Artificial Intelligence, enabling intuitive creation of complex AI workflows and seamless integration into existing applications. With its node-based user interface, users can construct sophisticated, multimodal applications without deep programming knowledge.

![nodetool](nodetool.png)

NodeTool opens up creative and playful access to cutting-edge AI technologies, supporting both beginners and experienced developers in content creation, data analysis, and automation. By visualizing workflows and simplifying complex installation requirements, NodeTool makes AI application development accessible to a broad audience.

## 🌟 Key Features

- **No-Code AI Development:** Create AI workflows without deep programming knowledge.
- **Model Agnostic:** Easily integrate state-of-the-art AI models from various sources.
- **Multimedia Content Handling:** Generate and edit images, texts, audio, video, and more within a single workflow.

## 🎨 Use Cases

- **AI Muse**: Generate unique artwork inspirations by combining different styles, eras, and subjects.
- **Sound-to-Visual Art**: Transform audio into visual masterpieces.
- **Digital Sketchbook Enhancer**: Elevate rough sketches with AI-generated details and animations.
- **AI-Curated Art Gallery**: Create virtual art exhibitions based on specific themes or movements.
- **Image Inpainting and Restoration**: Repair damaged or incomplete images by intelligently filling in missing areas.
- **Music Composition Assistant**: Generate musical ideas and compositions based on textual descriptions or themes.
- **Audio-to-Story Generator**: Create short stories or narratives inspired by audio inputs.
- **Image Enhancement Suite**: Improve image quality through various AI-powered enhancement techniques.
- **Multi-lingual Content Creation**: Produce and translate content across multiple languages for global audiences.
- **Data Visualization Tool**: Transform complex datasets into intuitive, visually appealing representations.

## 🚀 Quickstart

📥 Download the latest Release from our [Release Page](https://github.com/nodetool-ai/nodetool/releases)

## 📦 Installation

1. Extract the downloaded archive.
2. Run the installer.
3. Follow the instructions to complete the installation.

# 🧩 Node Overview

## Node Categories

NodeTool offers a diverse range of node categories to support various AI tasks:

1. **🧠 Anthropic**: Text-based AI operations using Anthropic's models.
2. **🤗 HuggingFace**: Comprehensive AI capabilities including audio, image, text, video, and multimodal processing.
3. **🔧 NodeTool**: Core functionalities for data manipulation, I/O operations, and various media processing.
4. **🦙 Ollama**: Text-based AI operations using Ollama models.
5. **🔮 OpenAI**: AI operations for audio, image, and text using OpenAI's models.
6. **🔁 Replicate**: Versatile AI capabilities for audio, image, text, and video processing.
7. **🎨 Stable Diffusion**: Specialized image generation and manipulation.

Each category contains specific nodes tailored for different AI tasks, allowing users to create complex workflows by combining nodes across these categories.

```
nodes
├── anthropic
│   └── text
├── huggingface
│   ├── audio
│   ├── huggingface_pipeline
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
└── stable_diffusion
    └── image
```

# 🏗️ Architecture

# Architecture Overview

NodeTool's architecture is designed for flexibility. Here's a breakdown of the main components:

1. **🖥️ React Frontend**: The user interface is built with React, providing an intuitive way for users to create and manage workflows.

2. **🌐 API Server**: Handles HTTP and WebSocket connections from the frontend, managing user sessions, workflow storage, and coordination between components.

3. **🔌 WebSocket Runner**: Responsible for executing workflows in real-time, maintaining the state of running workflows, and managing the communication between nodes.

4. **⚙️ Worker**: Performs the actual processing of individual nodes, allowing for parallel execution and scalability.

## Key Features:

- **Real-time Communication**: WebSocket connections enable live updates and interactive workflow execution.
- **Scalable Processing**: The Worker architecture allows for distributed processing of node tasks.
- **Flexible Node System**: Easy integration of new node types and AI services.
- **HTTP Callbacks**: Support for asynchronous operations and integration with external services.

## Data Flow:

1. User interacts with the React Frontend to create or modify workflows.
2. Frontend communicates with the API Server to save workflows and initiate execution.
3. API Server delegates workflow execution to the WebSocket Runner.
4. WebSocket Runner coordinates the execution of individual nodes through Workers.
5. Results are sent back to the Frontend in real-time via WebSocket connections.
6. HTTP Callbacks allow for asynchronous updates and integration with external services.

This architecture enables NodeTool to handle complex AI workflows efficiently, providing a seamless experience for users while maintaining the flexibility to incorporate various AI services and custom nodes.

```
                  +-------------------+
                  |                   |
                  |  React Frontend   |
                  |                   |
                  +--------+----------+
                           |
                           | HTTP/WebSocket
                           |
                  +--------v----------+
                  |                   |
         +------->|    API Server     |<------+
         |        |                   |       |
         |        +--------+----------+       |
         |                 |                  |
         |                 | Internal         |
         |                 | Communication    |
         |    +------------v------------+     |
         |    |                         |     |
         |    |   WebSocket Runner      |     |
         |    |                         |     |
         |    +------------+-----------+      |
         |                 |                  |
         |                 | WebSocket        |
         |                 |                  |
         |    +------------v------------+     |
         |    |                         |     |
         |    |        Worker           |     |
         |    |                         |     |
         +----+-------------------------+     |
              |                               |
              +-------------------------------+
                     HTTP Callbacks
```

## 🛠️ Implementing Custom Nodes

Extend NodeTool's functionality by creating custom nodes:

```python
class MyAgent(BaseNode):
    prompt: Field(default="Build me a website for my business.")

    async def process(self, context: ProcessingContext) -> str:
        llm = MyLLM()
        return llm.generate(self.prompt)
```

# 🔌 Using the Workflow API

NodeTool provides a powerful Workflow API that allows you to integrate and run your AI workflows programmatically. Here's a quick guide on how to use it:

## 🚀 Getting Started

1. **Obtain an API Token**: Log in to your NodeTool account and generate an API token from your user settings.

2. **Connect to the API**: Use the following endpoints:
   - API URL: `https://api.nodetool.ai/api`
   - WebSocket URL: `wss://api.nodetool.ai/predict`

## 📡 API Usage

### Loading Workflows

To retrieve available workflows:

```
const response = await fetch('https://api.nodetool.ai/api/workflows', {
    headers: {
        'Authorization': 'Bearer YOUR_API_TOKEN'
    }
});
const workflows = await response.json();
```

### Running a Workflow

Establish a connection and send the job request:

```
const socket = new WebSocket('wss://api.nodetool.ai/predict');
const request = {
    type: 'run_job_request',
    api_url: 'https://api.nodetool.ai/api',
    workflow_id: 'YOUR_WORKFLOW_ID',
    job_type: 'workflow',
    auth_token: 'YOUR_API_TOKEN',
    params: { / workflow parameters / }
 };
socket.send(msgpack.encode({
    command: 'run_job',
    data: request,
}));
```

While runnning handle responses:

````
socket.onmessage = async (event) => {
    const data = msgpack.decode(new Uint8Array(await event.data.arrayBuffer()));
    if (data.type === 'job_update' && data.status === 'completed') {
        // Handle completed job
        console.log('Workflow completed:', data.result);
    } else if (data.type === 'node_progress') {
        // Handle progress updates
        console.log('Progress:', data.progress / data.total 100);
    }
    // Handle other message types as needed
};

## 🧩 Example Implementation

For a complete example of how to implement the Workflow API in a web application, refer to our [API Demo](api-demo.html).

## 📊 Response Handling

- The API uses MessagePack for efficient data serialization.
- Responses include various types such as job updates, node progress, and results.
- Results may contain different data types (e.g., text, images) based on your workflow output.

By leveraging this API, you can seamlessly integrate NodeTool's powerful AI workflows into your own applications, enabling advanced AI capabilities with just a few lines of code.

## Requirements

- Python 3.10+
- NodeJS 20+

## Run backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
./scripts/server
````

## Run frontend

```bash
cd web
npm install
npm start
```

Now, open your browser and navigate to `http://localhost:3000` to access the NodeTool interface.

## Run Electron App

If you want to run the Electron App, you need to install the dependencies and start the frontend and backend.

```bash
cd electron
npm start
```

## Sync dependencies

Dependencies are managed in `pyproject.toml` and must be synced to `requirements.txt` using:

```
poetry export -f requirements.txt --output requirements.test.txt --without-hashes
```

## Contribution

We welcome contributions from the community! To contribute to Nodetool, please adhere to our contribution guidelines. Your efforts help us improve and evolve this project.

# License

Nodetool is made available under the terms of the [GPL3 License](LICENSE.txt), promoting open-source collaboration and sharing.

# Contact

For inquiries, suggestions, or contributions, please reach out to the core team:

- Matthias Georgi
- David Bürer

**GitHub:** [https://github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool)
