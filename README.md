# GenFlow

## Description

GenFlow is an innovative AI workflow engine, designed to integrate seamlessly with a node-based web interface. It enables users to orchestrate complex workflows involving various AI models for generating multimedia content, including images, text, audio, and video, all within a single, unified platform.

## Features

- **Diverse AI Model Integration:** Effortlessly combine a broad spectrum of AI models.
- **Multimedia Content Generation:** Create images, text, audio, and video within the same workflow.
- **Flexible Execution Environments:** Supports both local and remote execution options.
- **Comprehensive Platform Support:** Utilize models from leading platforms like Huggingface, Replicate, and OpenAI.
- **Advanced Database Integration:** Leverage support for vector databases to enhance your workflows.
- **ComfyUI Workflows:** Incorporate ComfyUI workflows for enhanced user interaction.
- **Retrieval Augmented Generation:** Implement RAG for sophisticated data retrieval and generation.
- **Serverless GPU Deployment:** Easily deploy workflows on serverless GPU platforms, including modal.com, for scalable processing power.

## Installation

GenFlow supports various Python environments, including CPython and PyPy. The installation instructions provided below cater to both environments for maximum compatibility.

### For CPython (default Python implementation)

```bash
pip install genflow-lib
```

## Usage

To get started with GenFlow:

```bash
genflow setup
```

## Execution

- **GenFlow Node Editor**: Install the GenFlow Node Editor for an intuitive, graphical interface to design and manage workflows.
- **Command Line Execution**: Alternatively, execute workflows directly from the command line for automation and scripting purposes.

## Implementing Nodes

New nodes can be added by subclassing GenflowNode.

Node properties are defined using class fields with type annotations.

The node operation is defined in the process method, which takes a context
object, allowing I/O amongst other operations.

```python
class MyNode(GenflowNode):
    a: str = ""
    b: str = ""

    async def process(self, context: ProcessingContext) -> str:
      return self.a + self.b
```

## Contribution

We welcome contributions from the community! To contribute to GenFlow, please adhere to our contribution guidelines. Your efforts help us improve and evolve this project.

## License

GenFlow is made available under the terms of the [GPL3 License](LICENSE.txt), promoting open-source collaboration and sharing.

## Contact

For inquiries, suggestions, or contributions, please reach out to the core team:

- Matthias Georgi
- David Buerer
- Severin Schwanck

**GitHub:** [https://github.com/Gen-Flow/genflow](https://github.com/Gen-Flow/genflow)
