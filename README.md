# nodetool

## Overview

NodeTool is a powerful no-code development environment for Artificial Intelligence, enabling intuitive creation of complex AI workflows and seamless integration into existing applications. With its node-based user interface, users can construct sophisticated, multimodal applications without deep programming knowledge..

![nodetool](nodetool.png)

NodeTool opens up creative and playful access to cutting-edge AI technologies, supporting both beginners and experienced developers in content creation, data analysis, and automation. By visualizing workflows and simplifying complex installation requirements, NodeTool makes AI application development accessible to a broad audience..

## Key Features

- No-Code AI Development: Create AI workflows without deep programming knowledge.
- Model Agnostic: Easily integrate state-of-the-art AI models from OpenAI, Anthropic, Replicate, HuggingFace, ComfyUI, Llama, Mistral, and more.
- Multimedia Content Handling: Generate and edit images, texts, audio, video and spreadsheets within a signle workflow.
- Asset management: Manage and organize your assets (images, videos, audio files) within the application

## Installation

Download the latest Release from our [Release Page](https://github.com/nodetool-ai/nodetool/releases)

# Models

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

# Architecture

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


## Implementing Custom Nodes

Extend NodeTool's functionality by creating custom nodes:

```python
class MyNode(BaseNode):
    a: str = ""
    b: str = ""

    async def process(self, context: ProcessingContext) -> str:
      return self.a + self.b
```

# Development

## Requirements

- Python 3.10+
- NodeJS 20+

## Run backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
nodetool worker
```

## Run frontend

```bash
cd web
npm install
npm start
```

## Build

```bash
cd web
npm run build
```

## Run Electron App

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
