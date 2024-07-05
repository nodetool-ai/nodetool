# nodetool

## Overview
Nodetool is a no-code development environment for Artificial Intelligence, enabling the simple and intuitive creation of powerful AI workflows and their integration into existing applications. Utilizing a node-based user interface, users can construct complex, multimodal applications without any programming knowledge. Nodetool facilitates the seamless integration of state-of-the-art AI models, allowing the generation and editing of multimedia content such as images, texts, audio, and video within a single workflow. 

![nodetool](nodetool.png)

Nodetool opens up a creative and playful access to current technologies, supporting both beginners and experienced developers in the fields of content creation, data analysis, and automation. It enables a broad audience to benefit from the advantages of artificial intelligence by visualizing workflows and simplifying complex installation requirements, making AI application development accessible to novices and seasoned users alike.


## Key Features
* No-Code AI Development: Create AI workflows without deep programming knowledge.
* Model Agnostic: Easily integrate new nodes and state-of-the-art AI models from OpenAI, Anthropic, Replicate, HuggingFace, ComfyUI, Llama, Mistral, and more.
* Multimedia Content Handling: Generate and edit images, texts, audio, and video in one workflow.
* Open and Transparent: Aims to make the execution and training of AI models more transparent and accessible.
* Asset management: Manage and organize your assets (images, videos, audio files) within the application


## Installation

```bash
pip install nodetool
```

## Usage

To get started with Nodetool:

```bash
nodetool setup
```

## Execution

- **Nodetool Editor**: Install the Nodetool Editor for an intuitive, graphical interface to design and manage workflows.
- **Command Line Execution**: Alternatively, execute workflows directly from the command line for automation and scripting purposes.

## Implementing Nodes

New nodes can be added by subclassing BaseNode.

Node properties are defined using class fields with type annotations.

The node operation is defined in the process method, which takes a context
object, allowing I/O amongst other operations.

```python
class MyNode(BaseNode):
    a: str = ""
    b: str = ""

    async def process(self, context: ProcessingContext) -> str:
      return self.a + self.b
```

# Environment Variables

Configuration can be passes as environment variables, or from configuration
files. A dot env (`.env`) file will be read if present in the working dirctory.

# Setup Files

The following files are used for storing settings and secrets:

- `settings.yaml`: Stores general settings
- `secrets.yaml`: Stores secret values (API keys, tokens, etc.)

The location of these files depends on the operating system:

- Linux/macOS: `~/.config/nodetool/`
- Windows: `%APPDATA%\nodetool\`

If the files don't exist, default values will be used.

# API Endpoints


## Authentication (/api/auth)

- POST `/api/auth/oauth/login`: Initiate OAuth login
- POST `/api/auth/oauth/callback`: Handle OAuth callback
- POST `/api/auth/verify`: Verify authentication token

## Assets (/api/assets)

- GET `/api/assets/`: List assets
- GET `/api/assets/temp`: Create temporary asset
- GET `/api/assets/{id}`: Get asset by ID
- PUT `/api/assets/{id}`: Update asset
- DELETE `/api/assets/{id}`: Delete asset
- POST `/api/assets/`: Create new asset

## Jobs (/api/jobs)

- GET `/api/jobs/{id}`: Get job status
- GET `/api/jobs/`: List jobs
- PUT `/api/jobs/{id}`: Update job
- POST `/api/jobs/`: Run a new job

## Messages (/api/messages)

- POST `/api/messages/`: Create new message
- GET `/api/messages/{message_id}`: Get message by ID
- GET `/api/messages/`: List messages for a thread

## Models (/api/models)

- GET `/api/models/llama_models`: List Llama models
- GET `/api/models/function_models`: List function models
- GET `/api/models/{folder}`: List model files in a folder

## Nodes (/api/nodes)

- GET `/api/nodes/dummy`: Get dummy node (for type checking)
- GET `/api/nodes/metadata`: Get metadata for all nodes

## Predictions (/api/predictions)

- GET `/api/predictions/`: List predictions
- GET `/api/predictions/{id}`: Get prediction by ID
- POST `/api/predictions/`: Create new prediction

## Storage (/api/storage)

- HEAD `/api/storage/{bucket}/{key}`: Get file metadata
- GET `/api/storage/{bucket}/{key}`: Download file
- PUT `/api/storage/{bucket}/{key}`: Upload or update file
- DELETE `/api/storage/{bucket}/{key}`: Delete file

## Tasks (/api/tasks)

- GET `/api/tasks/`: List tasks
- GET `/api/tasks/{id}`: Get task by ID
- POST `/api/tasks/`: Create new task
- PUT `/api/tasks/{id}`: Update task
- DELETE `/api/tasks/{id}`: Delete task

## Workflows (/api/workflows)

- POST `/api/workflows/`: Create new workflow
- GET `/api/workflows/`: List user's workflows
- GET `/api/workflows/public`: List public workflows
- GET `/api/workflows/public/{id}`: Get public workflow by ID
- GET `/api/workflows/user/{user_id}`: List workflows for a specific user
- GET `/api/workflows/examples`: List example workflows
- GET `/api/workflows/{id}`: Get workflow by ID
- PUT `/api/workflows/{id}`: Update workflow
- DELETE `/api/workflows/{id}`: Delete workflow


## Contribution

We welcome contributions from the community! To contribute to Nodetool, please adhere to our contribution guidelines. Your efforts help us improve and evolve this project.

## License

Nodetool is made available under the terms of the [GPL3 License](LICENSE.txt), promoting open-source collaboration and sharing.

## Contact

For inquiries, suggestions, or contributions, please reach out to the core team:

- Matthias Georgi
- David Bürer
- Severin Schwanck

**GitHub:** [https://github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool)
