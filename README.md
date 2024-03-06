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

# Environment Variables

Configuration can be passes as environment variables, or from configuration
files. A dot env (`.env`) file will be read if present in the working dirctory.

## General Configuration

| Variable          | Description                                          | Default                       |
| ----------------- | ---------------------------------------------------- | ----------------------------- |
| `ASSET_BUCKET`    | S3 bucket for storing asset files                    | `"images"`                    |
| `TEMP_BUCKET`     | S3 bucket for storing temporary files                | `"temp"`                      |
| `COMFY_FOLDER`    | Location of ComfyUI folder (optional)                | `None`                        |
| `ENV`             | Environment mode (`"development"` or `"production"`) | `"development"`               |
| `LOG_LEVEL`       | Logging level                                        | `"INFO"`                      |
| `AWS_REGION`      | AWS region                                           | `"us-east-1"`                 |
| `GENFLOW_API_URL` | URL of the Genflow API server                        | `"http://localhost:8000/api"` |

## Database Configuration

| Variable  | Description                      | Default               |
| --------- | -------------------------------- | --------------------- |
| `DB_PATH` | Path to the SQLite database file | `"./data/genflow.db"` |

## AWS Configuration

| Variable                   | Description                                   | Default                 |
| -------------------------- | --------------------------------------------- | ----------------------- |
| `AWS_ACCESS_KEY_ID`        | AWS access key ID                             | `None`                  |
| `AWS_SECRET_ACCESS_KEY`    | AWS secret access key                         | `None`                  |
| `DYNAMO_ENDPOINT_URL`      | DynamoDB endpoint URL (for local development) | `None`                  |
| `DYNAMO_REGION`            | DynamoDB region                               | `AWS_REGION`            |
| `DYNAMO_ACCESS_KEY_ID`     | DynamoDB access key ID                        | `AWS_ACCESS_KEY_ID`     |
| `DYNAMO_SECRET_ACCESS_KEY` | DynamoDB secret access key                    | `AWS_SECRET_ACCESS_KEY` |
| `S3_ENDPOINT_URL`          | S3 endpoint URL (for local development)       | `None`                  |
| `S3_ACCESS_KEY_ID`         | S3 access key ID                              | `AWS_ACCESS_KEY_ID`     |
| `S3_SECRET_ACCESS_KEY`     | S3 secret access key                          | `AWS_SECRET_ACCESS_KEY` |
| `S3_REGION`                | S3 region                                     | `AWS_REGION`            |

## API Keys and Tokens

| Variable              | Description                    |
| --------------------- | ------------------------------ |
| `OPENAI_API_KEY`      | OpenAI API key (optional)      |
| `HF_TOKEN`            | Hugging Face token (optional)  |
| `REPLICATE_API_TOKEN` | Replicate API token (optional) |
| `CHROMA_TOKEN`        | Chroma token                   |
| `NGROK_TOKEN`         | ngrok token                    |

## OAuth Configuration

| Variable               | Description                |
| ---------------------- | -------------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID     |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

## Other Configuration

| Variable     | Description              |
| ------------ | ------------------------ |
| `WORKER_URL` | URL of the worker server |
| `CHROMA_URL` | URL of the Chroma server |

# Setup Files

The following files are used for storing settings and secrets:

- `settings.yaml`: Stores general settings
- `secrets.yaml`: Stores secret values (API keys, tokens, etc.)

The location of these files depends on the operating system:

- Linux/macOS: `~/.config/genflow/`
- Windows: `%APPDATA%\genflow\`

If the files don't exist, default values will be used.

# API Documentation

| Endpoint                      | Method | Description                                                                                             | Parameters                                                                                                                                                                                                                            | Request Body                                                                                                                                                                                                                         |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/assets/`                | GET    | Returns all assets for a given user or workflow.                                                        | `query`: `parent_id` (string, nullable), `content_type` (string, nullable), `cursor` (string, nullable), `page_size` (number, nullable)<br>`header`: `authorization` (string, nullable)<br>`cookie`: `auth_cookie` (string, nullable) | -                                                                                                                                                                                                                                    |
| `/api/assets/`                | POST   | Create a new asset.                                                                                     | `header`: `authorization` (string, nullable)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                                            | `AssetCreateRequest`: <br>`workflow_id` (string, nullable)<br>`parent_id` (string, nullable)<br>`name` (string)<br>`content_type` (string)                                                                                           |
| `/api/assets/{id}`            | GET    | Returns the asset for the given id.                                                                     | `header`: `authorization` (string, nullable)<br>`path`: `id` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                   | -                                                                                                                                                                                                                                    |
| `/api/assets/{id}`            | PUT    | Updates the asset for the given id.                                                                     | `header`: `authorization` (string, nullable)<br>`path`: `id` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                   | `AssetUpdateRequest`:<br>`name` (string, nullable)<br>`parent_id` (string)<br>`status` (string, nullable)<br>`content_type` (string, nullable)                                                                                       |
| `/api/assets/{id}`            | DELETE | Deletes the asset for the given id.                                                                     | `header`: `authorization` (string, nullable)<br>`path`: `id` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                   | -                                                                                                                                                                                                                                    |
| `/api/jobs/{id}`              | GET    | Returns the status of a job.                                                                            | `header`: `authorization` (string, nullable)<br>`path`: `id` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                   | -                                                                                                                                                                                                                                    |
| `/api/jobs/`                  | GET    | Returns all assets for a given user or workflow.                                                        | `query`: `workflow_id` (string, nullable), `cursor` (string, nullable), `page_size` (number, nullable)<br>`header`: `authorization` (string, nullable)<br>`cookie`: `auth_cookie` (string, nullable)                                  | -                                                                                                                                                                                                                                    |
| `/api/jobs/`                  | POST   | Run                                                                                                     | `header`: `authorization` (string, nullable)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                                            | `RunJobRequest`:<br>`job_type` (string, default: 'workflow')<br>`params` (unknown)<br>`workflow_id` (string)<br>`user_id` (string)<br>`auth_token` (string)<br>`env` (Record<string, never>, nullable)<br>`graph` (Graph)            |
| `/api/auth/validate-token`    | POST   | Checks if the given token is valid.                                                                     | -                                                                                                                                                                                                                                     | `TokenRequest`:<br>`token` (string)                                                                                                                                                                                                  |
| `/api/auth/login`             | POST   | Logs a user in with one time passcode. Returns an auth token that can be used for future requests.      | -                                                                                                                                                                                                                                     | `LoginRequest`:<br>`email` (string)<br>`passcode` (string)                                                                                                                                                                           |
| `/api/auth/signup`            | POST   | Creates a new user for given email address. Returns an auth token that can be used for future requests. | -                                                                                                                                                                                                                                     | `SignupRequest`:<br>`email` (string)                                                                                                                                                                                                 |
| `/api/auth/oauth/login`       | POST   | Oauth Login                                                                                             | -                                                                                                                                                                                                                                     | `OAuthLoginRequest`:<br>`redirect_uri` (string)<br>`provider` (OAuthProvider)                                                                                                                                                        |
| `/api/auth/oauth/callback`    | POST   | Oauth Callback                                                                                          | -                                                                                                                                                                                                                                     | `OAuthAuthorizeRequest`:<br>`provider` (OAuthProvider)<br>`state` (string)<br>`authorization_response` (string)<br>`redirect_uri` (string)                                                                                           |
| `/api/nodes/dummy`            | GET    | Returns a dummy node.                                                                                   | -                                                                                                                                                                                                                                     | -                                                                                                                                                                                                                                    |
| `/api/nodes/metadata`         | GET    | Returns a list of all node metadata.                                                                    | -                                                                                                                                                                                                                                     | -                                                                                                                                                                                                                                    |
| `/api/assistants/`            | GET    | Returns all assistants for a given user or workflow.                                                    | `query`: `cursor` (string, nullable), `page_size` (number)<br>`header`: `authorization` (string, nullable)<br>`cookie`: `auth_cookie` (string, nullable)                                                                              | -                                                                                                                                                                                                                                    |
| `/api/assistants/`            | POST   | Create a new assistant.                                                                                 | `header`: `authorization` (string, nullable)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                                            | `AssistantCreateRequest`:<br>`name` (string)<br>`description` (string, nullable)<br>`instructions` (string, nullable)                                                                                                                |
| `/api/assistants/{id}`        | GET    | Returns the assistant for the given id.                                                                 | `header`: `authorization` (string, nullable)<br>`path`: `id` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                   | -                                                                                                                                                                                                                                    |
| `/api/assistants/{id}`        | PUT    | Updates the assistant for the given id.                                                                 | `header`: `authorization` (string, nullable)<br>`path`: `id` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                   | `AssistantUpdateRequest`:<br>`name` (string, nullable)<br>`description` (string, nullable)<br>`instructions` (string, nullable)<br>`workflows` (string[], nullable)<br>`nodes` (string[], nullable)<br>`assets` (string[], nullable) |
| `/api/assistants/{id}`        | DELETE | Deletes the assistant for the given id.                                                                 | `header`: `authorization` (string, nullable)<br>`path`: `id` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                   | -                                                                                                                                                                                                                                    |
| `/api/workflows/`             | GET    | Index                                                                                                   | `query`: `cursor` (string, nullable)<br>`header`: `authorization` (string, nullable)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                    | -                                                                                                                                                                                                                                    |
| `/api/workflows/`             | POST   | Create                                                                                                  | `header`: `authorization` (string, nullable)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                                            | `WorkflowRequest`:<br>`name` (string)<br>`description` (string)<br>`thumbnail` (string, nullable)<br>`access` (string)<br>`graph` (Graph, nullable)<br>`comfy_workflow` (Record<string, never>, nullable)                            |
| `/api/workflows/public`       | GET    | Public                                                                                                  | `query`: `limit` (number), `cursor` (string, nullable)                                                                                                                                                                                | -                                                                                                                                                                                                                                    |
| `/api/workflows/{id}`         | GET    | Get Workflow                                                                                            | `header`: `authorization` (string, nullable)<br>`path`: `id` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                   | -                                                                                                                                                                                                                                    |
| `/api/workflows/{id}`         | PUT    | Update Workflow                                                                                         | `header`: `authorization` (string, nullable)<br>`path`: `id` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                   | `WorkflowRequest`:<br>`name` (string)<br>`description` (string)<br>`thumbnail` (string, nullable)<br>`access` (string)<br>`graph` (Graph, nullable)<br>`comfy_workflow` (Record<string, never>, nullable)                            |
| `/api/workflows/{id}`         | DELETE | Delete Workflow                                                                                         | `header`: `authorization` (string, nullable)<br>`path`: `id` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                                   | -                                                                                                                                                                                                                                    |
| `/api/storage/{bucket}/{key}` | GET    | Returns the file as a stream for the given key.                                                         | `path`: `bucket` (string), `key` (string)                                                                                                                                                                                             | -                                                                                                                                                                                                                                    |
| `/api/storage/{bucket}/{key}` | PUT    | Updates or creates the file for the given key.                                                          | `path`: `bucket` (string), `key` (string)                                                                                                                                                                                             | -                                                                                                                                                                                                                                    |
| `/api/storage/{bucket}/{key}` | DELETE | Deletes the asset for the given key.                                                                    | `path`: `bucket` (string), `key` (string)                                                                                                                                                                                             | -                                                                                                                                                                                                                                    |
| `/api/models/{folder}`        | GET    | Index                                                                                                   | `header`: `authorization` (string, nullable)<br>`path`: `folder` (string)<br>`cookie`: `auth_cookie` (string, nullable)                                                                                                               | -                                                                                                                                                                                                                                    |
| `/`                           | GET    | Health Check                                                                                            | -                                                                                                                                                                                                                                     | -                                                                                                                                                                                                                                    |

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
