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

## Implementing Custom Nodes

Extend NodeTool's functionality by creating custom nodes:

```python
class MyNode(BaseNode):
    a: str = ""
    b: str = ""

    async def process(self, context: ProcessingContext) -> str:
      return self.a + self.b
```

# API Documentation

NodeTool provides a comprehensive API for various functionalities. Here are some key endpoints:

- Authentication: /api/auth/\*
- Assets: /api/assets/\*
- Jobs: /api/jobs/\*
- Models: /api/models/\*
- Workflows: /api/workflows/\*

For a complete list of endpoints, refer to the [API Documentation](https://nodetool-ai.github.io/nodetool/api.html)

## Development

Dependencies are managed in `pyproject.toml` and must be synced to `requirements.txt` using:

```
poetry export -f requirements.txt --output requirements.test.txt --without-hashes
```

## Contribution

We welcome contributions from the community! To contribute to Nodetool, please adhere to our contribution guidelines. Your efforts help us improve and evolve this project.

## License

Nodetool is made available under the terms of the [GPL3 License](LICENSE.txt), promoting open-source collaboration and sharing.

## Contact

For inquiries, suggestions, or contributions, please reach out to the core team:

- Matthias Georgi
- David Bürer

**GitHub:** [https://github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool)
