# Nodetool.ai

## Description

Nodetool is an innovative AI workflow engine, designed to integrate seamlessly with a node-based web interface. It enables users to orchestrate complex workflows involving various AI models for generating multimedia content, including images, text, audio, and video, all within a single, unified platform.

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

Nodetool supports various Python environments, including CPython and PyPy. The installation instructions provided below cater to both environments for maximum compatibility.

### For CPython (default Python implementation)

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

## General Configuration

| Variable           | Description                                          | Default                       |
| ------------------ | ---------------------------------------------------- | ----------------------------- |
| `ASSET_BUCKET`     | S3 bucket for storing asset files                    | `"images"`                    |
| `TEMP_BUCKET`      | S3 bucket for storing temporary files                | `"temp"`                      |
| `COMFY_FOLDER`     | Location of ComfyUI folder (optional)                | `None`                        |
| `ENV`              | Environment mode (`"development"` or `"production"`) | `"development"`               |
| `LOG_LEVEL`        | Logging level                                        | `"INFO"`                      |
| `AWS_REGION`       | AWS region                                           | `"us-east-1"`                 |
| `NODETOOL_API_URL` | URL of the Nodetool API server                       | `"http://localhost:8000/api"` |

## Database Configuration

| Variable  | Description                      | Default                |
| --------- | -------------------------------- | ---------------------- |
| `DB_PATH` | Path to the SQLite database file | `"./data/nodetool.db"` |

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

- Linux/macOS: `~/.config/nodetool/`
- Windows: `%APPDATA%\nodetool\`

If the files don't exist, default values will be used.

# API Endpoints

| Endpoint                   | Method | Description                                                                                             | Query Key      | Query Value      | Body Key                 | Body Value                      |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------- | -------------- | ---------------- | ------------------------ | ------------------------------- |
| `/api/assets/`             | GET    | Returns all assets for a given user or workflow.                                                        | `parent_id`    | string, nullable | -                        | -                               |
|                            |        |                                                                                                         | `content_type` | string, nullable | -                        | -                               |
|                            |        |                                                                                                         | `cursor`       | string, nullable | -                        | -                               |
|                            |        |                                                                                                         | `page_size`    | number, nullable | -                        | -                               |
| `/api/assets/`             | POST   | Create a new asset.                                                                                     | -              | -                | `workflow_id`            | string, nullable                |
|                            |        |                                                                                                         | -              | -                | `parent_id`              | string, nullable                |
|                            |        |                                                                                                         | -              | -                | `name`                   | string                          |
|                            |        |                                                                                                         | -              | -                | `content_type`           | string                          |
| `/api/assets/{id}`         | GET    | Returns the asset for the given id.                                                                     | -              | -                | -                        | -                               |
| `/api/assets/{id}`         | PUT    | Updates the asset for the given id.                                                                     | -              | -                | `name`                   | string, nullable                |
|                            |        |                                                                                                         | -              | -                | `parent_id`              | string                          |
|                            |        |                                                                                                         | -              | -                | `status`                 | string, nullable                |
|                            |        |                                                                                                         | -              | -                | `content_type`           | string, nullable                |
| `/api/assets/{id}`         | DELETE | Deletes the asset for the given id.                                                                     | -              | -                | -                        | -                               |
| `/api/jobs/{id}`           | GET    | Returns the status of a job.                                                                            | -              | -                | -                        | -                               |
| `/api/jobs/`               | GET    | Returns all assets for a given user or workflow.                                                        | `workflow_id`  | string, nullable | -                        | -                               |
|                            |        |                                                                                                         | `cursor`       | string, nullable | -                        | -                               |
|                            |        |                                                                                                         | `page_size`    | number, nullable | -                        | -                               |
| `/api/jobs/`               | POST   | Run                                                                                                     | -              | -                | `job_type`               | string, default: 'workflow'     |
|                            |        |                                                                                                         | -              | -                | `params`                 | unknown                         |
|                            |        |                                                                                                         | -              | -                | `workflow_id`            | string                          |
|                            |        |                                                                                                         | -              | -                | `user_id`                | string                          |
|                            |        |                                                                                                         | -              | -                | `auth_token`             | string                          |
|                            |        |                                                                                                         | -              | -                | `env`                    | Record<string, never>, nullable |
|                            |        |                                                                                                         | -              | -                | `graph`                  | Graph                           |
| `/api/auth/validate-token` | POST   | Checks if the given token is valid.                                                                     | -              | -                | `token`                  | string                          |
| `/api/auth/login`          | POST   | Logs a user in with one time passcode. Returns an auth token that can be used for future requests.      | -              | -                | `email`                  | string                          |
|                            |        |                                                                                                         | -              | -                | `passcode`               | string                          |
| `/api/auth/signup`         | POST   | Creates a new user for given email address. Returns an auth token that can be used for future requests. | -              | -                | `email`                  | string                          |
| `/api/auth/oauth/login`    | POST   | Oauth Login                                                                                             | -              | -                | `redirect_uri`           | string                          |
|                            |        |                                                                                                         | -              | -                | `provider`               | OAuthProvider                   |
| `/api/auth/oauth/callback` | POST   | Oauth Callback                                                                                          | -              | -                | `provider`               | OAuthProvider                   |
|                            |        |                                                                                                         | -              | -                | `state`                  | string                          |
|                            |        |                                                                                                         | -              | -                | `authorization_response` | string                          |
|                            |        |                                                                                                         | -              | -                | `redirect_uri`           | string                          |
| `/api/nodes/dummy`         | GET    | Returns a dummy node.                                                                                   | -              | -                | -                        | -                               |
| `/api/nodes/metadata`      | GET    | Returns a list of all node metadata.                                                                    | -              | -                | -                        | -                               |

| `/api

## Contribution

We welcome contributions from the community! To contribute to Nodetool, please adhere to our contribution guidelines. Your efforts help us improve and evolve this project.

## License

Nodetool is made available under the terms of the [GPL3 License](LICENSE.txt), promoting open-source collaboration and sharing.

## Contact

For inquiries, suggestions, or contributions, please reach out to the core team:

- Matthias Georgi
- David Buerer
- Severin Schwanck

**GitHub:** [https://github.com/Gen-Flow/nodetool](https://github.com/Gen-Flow/nodetool)
