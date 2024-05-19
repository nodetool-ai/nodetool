import os
from pathlib import Path
from typing import Any


def get_data_path(filename: str):
    """
    Get the default database path.
    """
    import platform
    from pathlib import Path

    os_name = platform.system()
    if os_name == "Linux" or os_name == "Darwin":
        return Path.home() / ".local" / "share" / "nodetool" / filename
    elif os_name == "Windows":
        appdata = os.getenv("APPDATA")
        if appdata is not None:
            return Path(appdata) / "nodetool" / filename
        else:
            return Path("data") / filename
    else:
        return Path("data") / filename


def get_system_file_path(filename: str):
    """
    Returns the path to the settings file for the current OS.
    """
    import platform
    from pathlib import Path

    os_name = platform.system()
    if os_name == "Linux" or os_name == "Darwin":
        return Path.home() / ".config" / "nodetool" / filename
    elif os_name == "Windows":
        appdata = os.getenv("APPDATA")
        if appdata is not None:
            return Path(appdata) / "nodetool" / filename
        else:
            return Path("data") / filename
    else:
        return Path("data") / filename


MISSING_MESSAGE = "Missing required environment variable: {}"

# Default values for environment variables
DEFAULT_ENV = {
    "ASSET_BUCKET": "images",
    "TEMP_BUCKET": "temp",
    "CHROMA_URL": None,
    "CHROMA_PATH": str(get_data_path("chroma")),
    "COMFY_FOLDER": None,
    "ASSET_FOLDER": str(get_data_path("assets")),
    "DB_PATH": str(get_data_path("nodetool.sqlite3")),
    "LM_STUDIO_FOLDER": os.path.join(os.path.expanduser("~/.cache/lm-studio/models")),
    "REPLICATE_API_TOKEN": None,
    "OPENAI_API_KEY": None,
    "HF_TOKEN": None,
    "ENV": "development",
    "LOG_LEVEL": "INFO",
    "REMOTE_AUTH": "0",
    "DEBUG": None,
    "USE_NGROK": None,
    "AWS_REGION": "us-east-1",
    "NODETOOL_API_URL": "http://localhost:8000/api",
}

SETTINGS_FILE = "settings.yaml"
SECRETS_FILE = "secrets.yaml"

SETTINGS_SETUP = [
    {
        "key": "COMFY_FOLDER",
        "prompt": "Location of ComfyUI folder (optional)",
    },
]

SECRETS_SETUP = [
    {"key": "OPENAI_API_KEY", "prompt": "OpenAI API key (optional)"},
    {"key": "HF_TOKEN", "prompt": "Hugging Face Token (optional)"},
    {
        "key": "REPLICATE_API_TOKEN",
        "prompt": "Replicate API Token (optional)",
    },
]


class Environment(object):
    """
    A class that manages environment variables and provides default values and type conversions.

    This class acts as a central place to manage environment variables and settings for the application.
    It provides methods to retrieve and set various configuration values, such as AWS credentials, API keys,
    database paths, and more.

    Settings and Secrets:
    The class supports loading and saving settings and secrets from/to YAML files. The settings file
    (`settings.yaml`) stores general configuration options, while the secrets file (`secrets.yaml`)
    stores sensitive information like API keys.

    Local Mode:
    In local mode (non-production environment), the class uses default values or prompts the user for
    input during the setup process. It also supports local file storage and SQLite database for
    development purposes.

    Cloud Setup:
    In production mode, the class expects environment variables to be set for various services like
    AWS, OpenAI, and others. It uses AWS services like S3 and DynamoDB for storage and database,
    respectively.


    Initialization:
    The class is designed to be used as a singleton, with class methods providing access to various
    configuration values and services. The `setup` method guides the user through the initial setup
    process, prompting for required values and saving the settings and secrets.

    Usage:
    To access configuration values or services, simply call the corresponding class method, e.g.,
    `Environment.get_aws_region()`, `Environment.get_openai_client()`, etc. These methods handle
    the logic of retrieving the appropriate value based on the environment (local or production)..
    """

    model_files: dict[str, list[str]] = {}
    settings: dict[str, Any] | None = None
    secrets: dict[str, Any] | None = None
    remote_auth: bool = True

    @classmethod
    def get_aws_execution_env(cls):
        return os.getenv("AWS_EXECUTION_ENV", None)

    @classmethod
    def has_settings(cls):
        """
        Returns True if the settings file exists.
        """
        return get_system_file_path(SETTINGS_FILE).exists()

    @classmethod
    def has_secrets(cls):
        """
        Returns True if the secrets file exists.
        """
        return get_system_file_path(SECRETS_FILE).exists()

    @classmethod
    def load_settings(cls):
        """
        Load the settings from the settings file.
        Loas the secrets from the secrets file.
        """
        import yaml

        settings_file = get_system_file_path(SETTINGS_FILE)
        secrets_file = get_system_file_path(SECRETS_FILE)

        if settings_file.exists():
            with open(settings_file, "r") as f:
                cls.settings = yaml.safe_load(f)  # type: ignore

        if secrets_file.exists():
            with open(secrets_file, "r") as f:
                cls.secrets = yaml.safe_load(f)  # type: ignore

        if cls.settings is None:
            cls.settings = {}

        if cls.secrets is None:
            cls.secrets = {}

    @classmethod
    def save_settings(cls):
        """
        Save the user settings to the settings file.
        Save the user secrets to the secrets file.
        """
        import yaml

        settings_file = get_system_file_path(SETTINGS_FILE)
        secrets_file = get_system_file_path(SECRETS_FILE)

        print()
        print(f"Saving settings to {settings_file}")
        print(f"Saving secrets to {secrets_file}")

        os.makedirs(os.path.dirname(settings_file), exist_ok=True)
        os.makedirs(os.path.dirname(secrets_file), exist_ok=True)

        with open(settings_file, "w") as f:
            yaml.dump(cls.settings, f)

        with open(secrets_file, "w") as f:
            yaml.dump(cls.secrets, f)

    @classmethod
    def get_settings(cls):
        """
        Returns a dictionary of settings.
        """
        if cls.settings is None:
            cls.load_settings()
        assert cls.settings is not None
        return cls.settings

    @classmethod
    def get_secrets(cls):
        """
        Returns a dictionary of secrets.
        """
        if cls.secrets is None:
            cls.load_settings()
        assert cls.secrets is not None
        return cls.secrets

    @classmethod
    def setup(cls):
        """
        Runs the configuration wizard to set up the environment.
        """

        # Initialize the settings and secrets
        cls.load_settings()
        assert cls.settings is not None
        assert cls.secrets is not None

        print("Setting up Nodetool environment")
        print("Press enter to use the default value")
        print("Press ctrl-c to exit")
        print()

        for step in SETTINGS_SETUP:
            default_value = cls.get(step["key"])
            default_prompt = f" [{default_value}]: " if default_value else ": "
            value = input(step["prompt"] + default_prompt).strip()
            cls.settings[step["key"]] = default_value if value == "" else value

        def mask_secret(prompt: str, num_chars: int = 8) -> str:
            return "*" * num_chars + prompt[num_chars:]

        for step in SECRETS_SETUP:
            default_value = cls.secrets.get(step["key"])
            default_prompt = (
                f" [{mask_secret(default_value)}]: " if default_value else ": "
            )
            value = input(step["prompt"] + default_prompt).strip()
            cls.secrets[step["key"]] = default_value if value == "" else value

        cls.save_settings()

        print()
        print("Initializing database")
        cls.initialize_database()

        print()
        print("Environment setup complete!")
        print("You can now run the Nodetool server using the 'nodetool serve' command")
        print()

    @classmethod
    def initialize_database(cls):
        """
        Initialize the database.
        """
        from nodetool.models.schema import create_all_tables

        create_all_tables()

    @classmethod
    def get(cls, key: str):
        """
        Get the value of an environment variable, or a default value.

        If the environment variable is not set, and the key is not in the
        default values, raise an exception.
        """

        if key in os.environ:
            return os.environ[key]
        elif key in cls.get_settings():
            return cls.get_settings()[key]
        elif key in cls.get_secrets():
            return cls.get_secrets()[key]
        elif key in DEFAULT_ENV:
            return DEFAULT_ENV[key]
        else:
            raise Exception(MISSING_MESSAGE.format(key))

    @classmethod
    def get_aws_region(cls):
        """
        The AWS region is the region where we run AWS services.
        """
        return cls.get("AWS_REGION")

    @classmethod
    def get_asset_bucket(cls):
        """
        The asset bucket is the S3 bucket where we store asset files.
        """
        return cls.get("ASSET_BUCKET")

    @classmethod
    def get_temp_bucket(cls):
        """
        The temp bucket is the S3 bucket where we store temporary files.
        """
        return cls.get("TEMP_BUCKET")

    @classmethod
    def get_env(cls):
        """
        The environment is either "development" or "production".
        """
        return cls.get("ENV")

    @classmethod
    def is_production(cls):
        """
        Is the environment production?
        """
        return cls.get_env() == "production"

    @classmethod
    def is_test(cls):
        """
        Is the environment test?
        """
        return cls.get_env() == "test"

    @classmethod
    def set_remote_auth(cls, remote_auth: bool):
        os.environ["REMOTE_AUTH"] = "1" if remote_auth else "0"

    @classmethod
    def use_remote_auth(cls):
        """
        A single local user with id 1 is used for authentication when this evaluates to False.
        """
        return cls.is_production() or cls.get("REMOTE_AUTH") == "1"

    @classmethod
    def is_debug(cls):
        """
        Is debug flag on?
        """
        return cls.get("DEBUG")

    @classmethod
    def get_log_level(cls):
        """
        The log level is the level of logging that we use.
        """
        return cls.get("LOG_LEVEL")

    @classmethod
    def get_dynamo_endpoint(cls):
        """
        In development, we use a local instance.
        In production, we use the real AWS.
        """
        return os.environ.get("DYNAMO_ENDPOINT_URL", None)

    @classmethod
    def get_dynamo_region(cls):
        """
        The region name is the region of the DynamoDB server.
        """
        return os.environ.get("DYNAMO_REGION", cls.get_aws_region())

    @classmethod
    def get_dynamo_access_key_id(cls):
        """
        The access key id is the id of the AWS user.
        """
        # If we are in production, we don't need an access key id.
        # We use the IAM role instead.
        return os.environ.get("DYNAMO_ACCESS_KEY_ID", cls.get_aws_access_key_id())

    @classmethod
    def get_dynamo_secret_access_key(cls):
        """
        The secret access key is the secret of the AWS user.
        """
        # If we are in production, we don't need a secret access key.
        # We use the IAM role instead.
        return os.environ.get(
            "DYNAMO_SECRET_ACCESS_KEY", cls.get_aws_secret_access_key()
        )

    @classmethod
    def get_db_path(cls):
        """
        The database url is the url of the database.
        """
        return cls.get("DB_PATH")

    @classmethod
    def get_database_adapter(cls, fields: dict[str, Any], table_schema: dict[str, Any]):
        """
        The database adapter is the adapter that we use to connect to the database.
        """
        if cls.get_dynamo_endpoint() is not None:
            from nodetool.models.dynamo_adapter import DynamoAdapter

            return DynamoAdapter(
                client=cls.get_dynamo_client(),
                fields=fields,
                table_schema=table_schema,
            )
        else:
            from nodetool.models.sqlite_adapter import SQLiteAdapter

            if cls.get_db_path() != ":memory:":
                os.makedirs(os.path.dirname(cls.get_db_path()), exist_ok=True)

            return SQLiteAdapter(
                db_path=cls.get_db_path(),
                fields=fields,
                table_schema=table_schema,
            )

    @classmethod
    def get_aws_access_key_id(cls):
        """
        The access key id is the id of the AWS user.
        """
        # If we are in production, we don't need an access key id.
        # We use the IAM role instead.
        return os.environ.get("AWS_ACCESS_KEY_ID")

    @classmethod
    def get_aws_secret_access_key(cls):
        """
        The secret access key is the secret of the AWS user.
        """
        # If we are in production, we don't need a secret access key.
        # We use the IAM role instead.
        return os.environ.get("AWS_SECRET_ACCESS_KEY")

    @classmethod
    def get_s3_endpoint_url(cls):
        """
        The endpoint url is the url of the S3 server.
        """
        return os.environ.get("S3_ENDPOINT_URL", None)

    @classmethod
    def get_s3_access_key_id(cls):
        """
        The access key id is the id of the AWS user.
        """
        # If we are in production, we don't need an access key id.
        # We use the IAM role instead.
        return os.environ.get("S3_ACCESS_KEY_ID", cls.get_aws_access_key_id())

    @classmethod
    def get_s3_secret_access_key(cls):
        """
        The secret access key is the secret of the AWS user.
        """
        # If we are in production, we don't need a secret access key.
        # We use the IAM role instead.
        return os.environ.get("S3_SECRET_ACCESS_KEY", cls.get_aws_secret_access_key())

    @classmethod
    def get_s3_region(cls):
        """
        The region name is the region of the S3 server.
        """
        return os.environ.get("S3_REGION", cls.get_aws_region())

    @classmethod
    def get_openai_api_key(cls):
        """
        The openai api key is the api key of the openai server.
        """
        return cls.get("OPENAI_API_KEY")

    @classmethod
    def get_anthropic_api_key(cls):
        """
        The anthropic api key is the api key of the anthropic server.
        """
        return cls.get("ANTHROPIC_API_KEY")

    @classmethod
    def get_worker_url(cls):
        """
        The worker url is the url of the worker server.
        """
        return os.environ.get("WORKER_URL")

    @classmethod
    def get_nodetool_api_url(cls):
        """
        The nodetool api url is the url of the nodetool api server.
        """
        return cls.get("NODETOOL_API_URL")

    @classmethod
    def get_nodetool_api_client(cls, auth_token: str):
        """
        The nodetool api client is a wrapper around the nodetool api.
        """
        from nodetool.common.nodetool_api_client import NodetoolAPIClient

        return NodetoolAPIClient(
            auth_token=auth_token, base_url=cls.get_nodetool_api_url()
        )

    @classmethod
    def get_openai_client(cls):
        from openai import AsyncClient

        return AsyncClient(api_key=cls.get_openai_api_key())

    @classmethod
    def get_anthropic_client(cls):
        from anthropic import AsyncAnthropic

        return AsyncAnthropic(api_key=cls.get_anthropic_api_key())

    @classmethod
    def get_chroma_token(cls):
        """
        The chroma token is the token of the chroma server.
        """
        return cls.get("CHROMA_TOKEN")

    @classmethod
    def get_chroma_url(cls):
        """
        The chroma url is the url of the chroma server.
        """
        return cls.get("CHROMA_URL")

    @classmethod
    def get_chroma_path(cls):
        """
        The chroma path is the path of the chroma server.
        """
        return cls.get("CHROMA_PATH")

    @classmethod
    def get_chroma_settings(cls):
        from chromadb.config import Settings

        if cls.get_chroma_url() is not None:
            return Settings(
                chroma_api_impl="chromadb.api.fastapi.FastAPI",
                # chroma_client_auth_provider="token",
                # chroma_client_auth_credentials=cls.get_chroma_token(),
                chroma_server_host=cls.get_chroma_url(),
            )
        else:
            return Settings(
                chroma_api_impl="chromadb.api.segment.SegmentAPI",
                is_persistent=True,
                persist_directory="multitenant",
            )

    @classmethod
    def find_function_model(cls, name: str):
        """
        Find a function model by name.
        """
        from nodetool.metadata.types import FunctionModel

        for model in cls.get_function_models():
            if model.name == name:
                return model

        return FunctionModel(name=name)

    @classmethod
    def find_llama_model(cls, name: str):
        """
        Find a llama model by name.
        """
        for model in cls.get_llama_models():
            if model.name == name:
                return model

        for model in cls.get_functionary_models():
            if model.name == name:
                return model

        return None

    @classmethod
    def get_function_models(cls):
        from nodetool.metadata.types import FunctionModel, GPTModel

        return [
            FunctionModel(
                name=GPTModel.GPT3.value,
            ),
            FunctionModel(
                name=GPTModel.GPT4.value,
            ),
        ] + cls.get_functionary_models()

    @classmethod
    def get_functionary_models(cls):
        import huggingface_hub
        from nodetool.metadata.types import FunctionModel

        return [
            FunctionModel(
                repo_id=repo.repo_id, filename=file.file_name, local_path=file.file_path
            )
            for repo in huggingface_hub.scan_cache_dir().repos
            for rev in repo.revisions
            for file in rev.files
            if "functionary" in file.file_name
        ]

    @classmethod
    def get_llama_models(cls):
        import huggingface_hub
        from nodetool.metadata.types import LlamaModel

        return [
            LlamaModel(
                name=file.file_name,
                repo_id=repo.repo_id,
                filename=file.file_name,
                local_path=file.file_path,
            )
            for repo in huggingface_hub.scan_cache_dir().repos
            for rev in repo.revisions
            for file in rev.files
            if file.file_name.endswith(".gguf")
        ] + cls.get_lm_studio_models()

    @classmethod
    def get_all_llama_models(cls):
        from nodetool.metadata.types import LlamaModel

        models = [
            LlamaModel(
                repo_id="TheBloke/phi-2-GGUF",
                filename="*Q4_K_S.gguf",
                name="phi-2-GGUF",
            ),
            LlamaModel(
                repo_id="lmstudio-ai/gemma-2b-it-GGUF",
                filename="*q8_0.gguf",
                name="gemma-2b-it-GGUF",
            ),
            LlamaModel(
                repo_id="Qwen/Qwen1.5-0.5B-Chat-GGUF",
                filename="*q8_0.gguf",
                name="Qwen1.5-0.5B-Chat-GGUF",
            ),
            LlamaModel(
                repo_id="Qwen/Qwen1.5-1.8B-Chat-GGUF",
                filename="*q8_0.gguf",
                name="Qwen1.5-1.8B-Chat-GGUF",
            ),
            LlamaModel(
                repo_id="Qwen/Qwen1.5-4.0B-Chat-GGUF",
                filename="*q8_0.gguf",
                name="Qwen1.5-4.0B-Chat-GGUF",
            ),
            LlamaModel(
                repo_id="Qwen/Qwen1.5-7.0B-Chat-GGUF",
                filename="*q4_0.gguf",
                name="Qwen1.5-7.0B-Chat-GGUF",
            ),
            LlamaModel(
                repo_id="TheBloke/Mistral-7B-Instruct-v0.1-GGUF",
                filename="*Q4_0.gguf",
                name="Mistral-7B-Instruct-v0.1-GGUF",
            ),
            LlamaModel(
                repo_id="TheBloke/Mistral-8x-7B-Instruct-v0.1-GGUF",
                filename="*Q2_K.gguf",
                name="Mistral-8x-7B-Instruct-v0.1-GGUF",
            ),
            LlamaModel(
                repo_id="TheBloke/CapybaraHermes-2.5-Mistral-7B-GGUF",
                filename="*Q4_0.gguf",
                name="CapybaraHermes-2.5-Mistral-7B-GGUF",
            ),
            LlamaModel(
                repo_id="TheBloke/Dolphin-2.5-Mixtral-8x7B-GGUF",
                filename="*Q2_K.gguf",
                name="Dolphin-2.5-Mixtral-8x7B-GGUF",
            ),
            LlamaModel(
                repo_id="TheBloke/zephyr-7B-beta-GGUF",
                filename="*Q4_0.gguf",
                name="zephyr-7B-beta-GGUF",
            ),
        ]

        return models

    @classmethod
    def get_lm_studio_models(cls):
        """
        Find all llama models in known folders.
        Currently it only looks in the LM Studio folder.
        """
        import glob
        from nodetool.metadata.types import LlamaModel

        folder = cls.get_lm_studio_folder()
        files = glob.glob(f"{folder}/**/*.gguf", recursive=True)
        return [
            LlamaModel(
                filename=os.path.basename(file),
                name=os.path.basename(file),
                local_path=Path(file),
            )
            for file in files
        ]

    @classmethod
    def get_language_models(cls):
        """
        Find all language models.
        """
        from nodetool.metadata.types import LanguageModel, GPTModel

        return [
            LanguageModel(
                name=GPTModel.GPT3.value,
            ),
            LanguageModel(
                name=GPTModel.GPT4.value,
            ),
        ] + [LanguageModel(**model.model_dump()) for model in cls.get_llama_models()]

    @classmethod
    def get_model_files(cls, folder: str):
        """
        Get the files in a model folder.
        """

        if folder == "language_model":
            return [m.name for m in cls.get_language_models()]
        elif folder == "function_model":
            return [m.name for m in cls.get_function_models()]
        elif folder == "llama_model":
            return [m.name for m in cls.get_llama_models()]
        elif len(cls.model_files) > 0:
            return cls.model_files.get(folder, [])
        else:
            import comfy.folder_paths

            return comfy.folder_paths.get_filename_list(folder)

    @classmethod
    def get_comfy_folder(cls):
        """
        The comfy folder is the folder where ComfyUI is located.
        """
        return cls.get("COMFY_FOLDER")

    @classmethod
    def get_asset_folder(cls):
        """
        The asset folder is the folder where assets are located.
        """
        return cls.get("ASSET_FOLDER")

    @classmethod
    def get_lm_studio_folder(cls):
        """
        The LM Studio folder is the folder where LM Studio is located.
        """
        return cls.get("LM_STUDIO_FOLDER")

    @classmethod
    def get_replicate_api_token(cls):
        """
        The replicate api token is the api token of the replicate server.
        """
        return cls.get("REPLICATE_API_TOKEN")

    @classmethod
    def get_huggingface_token(cls):
        """
        The huggingface token.
        """
        return cls.get("HF_TOKEN")

    @classmethod
    def get_ngrok_token(cls):
        """
        The ngrok token is the token of the ngrok server.
        """
        return cls.get("NGROK_TOKEN")

    @classmethod
    def get_use_ngrok(cls):
        """
        The use ngrok flag is the flag that determines if we use ngrok.
        """
        return cls.get("USE_NGROK")

    @classmethod
    def get_api_tunnel_url(cls):
        """
        The api tunnel url is the url of the api tunnel server.
        """
        if not hasattr(cls, "api_tunnel_url"):
            from pyngrok import ngrok

            ngrok_token = cls.get_ngrok_token()

            # run ngrok to expose http port 8000 and return the public url
            # Optionally set your ngrok token if you haven't done so globally
            ngrok.set_auth_token(ngrok_token)

            # Establish a tunnel to port 8000 (HTTP by default)
            tunnel = ngrok.connect("localhost:8000")

            # Retrieve the public URL where the tunnel is accessible
            assert tunnel.public_url, "No public url found"
            api_url = tunnel.public_url + "/api"
            print(f'ngrok tunnel "api_url" -> "localhost:8000"')

            cls.api_tunnel_url = api_url

        return cls.api_tunnel_url

    @classmethod
    def get_google_client_id(cls):
        """
        The google client id is the id of the google client.
        """
        return cls.get("GOOGLE_CLIENT_ID")

    @classmethod
    def get_google_client_secret(cls):
        """
        The google client secret is the secret of the google client.
        """
        return cls.get("GOOGLE_CLIENT_SECRET")

    @classmethod
    def get_s3_service(cls, bucket: str):
        """
        Get the S3 service.
        """
        from nodetool.common.aws_client import AWSClient

        return AWSClient(
            endpoint_url=cls.get_s3_endpoint_url(),
            access_key_id=cls.get_s3_access_key_id(),
            secret_access_key=cls.get_s3_secret_access_key(),
            region_name=cls.get_s3_region(),
            log=cls.get_logger(),
        ).get_s3_service(bucket)

    @classmethod
    def get_asset_storage(cls, use_s3: bool = False):
        """
        Get the storage adapter for assets.
        """
        if cls.is_production() or cls.get_s3_endpoint_url() is not None or use_s3:
            return cls.get_s3_service(cls.get_asset_bucket())
        else:
            from nodetool.storage.file_storage import FileStorage

            if not hasattr(cls, "asset_storage"):
                if cls.is_test():
                    from nodetool.storage.memory_storage import MemoryStorage

                    cls.asset_storage = MemoryStorage(
                        base_url=f"{cls.get_nodetool_api_url()}/storage/"
                        + cls.get_asset_bucket()
                    )
                else:
                    cls.get_logger().info(f"Using local file storage for asset storage")
                    cls.asset_storage = FileStorage(
                        base_path=cls.get_asset_folder(),
                        base_url=f"{cls.get_nodetool_api_url()}/storage/"
                        + cls.get_asset_bucket(),
                    )

            return cls.asset_storage

    @classmethod
    def get_temp_storage(cls, use_s3: bool = False):
        """
        Get the storage adapter for temporary files.
        """
        if cls.is_production() and cls.get_s3_endpoint_url() is not None or use_s3:
            cls.get_logger().info(f"Using S3 for temp storage")
            return cls.get_s3_service(cls.get_temp_bucket())
        else:
            from nodetool.storage.memory_storage import MemoryStorage

            cls.get_logger().info(f"Using local file storage for temp storage")

            if not hasattr(cls, "temp_storage"):
                cls.temp_storage = MemoryStorage(
                    base_url=f"{cls.get_nodetool_api_url()}/storage/"
                    + cls.get_temp_bucket()
                )
            return cls.temp_storage

    @classmethod
    def get_logger(cls):
        """
        Get a logger.
        """
        import logging

        if not hasattr(cls, "logger"):
            cls.logger = logging.getLogger("avatai")
            cls.logger.setLevel(cls.get_log_level())
            cls.logger.addHandler(logging.StreamHandler())
        return cls.logger

    @classmethod
    def get_replicate_client(cls):
        """
        The replicate client is a wrapper around the replicate SDK.
        """
        import replicate

        if not hasattr(cls, "replicate_client"):
            cls.replicate_client = replicate.Client(cls.get_replicate_api_token())
        return cls.replicate_client

    @classmethod
    def get_aws_client(
        cls,
        endpoint_url: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        region_name: str | None = None,
        session_token: str | None = None,
    ):
        """
        The AWS client is a wrapper around the AWS SDK.

        If the class has an instance of AWSClient, return it.
        """
        from nodetool.common.aws_client import AWSClient

        if region_name is None:
            region_name = cls.get_aws_region()
        return AWSClient(
            endpoint_url=endpoint_url,
            access_key_id=access_key_id,
            secret_access_key=secret_access_key,
            region_name=region_name,
            session_token=session_token,
            log=cls.get_logger(),
        )

    @classmethod
    def get_dynamo_resource(cls):
        """
        The dynamo client is a wrapper around the AWS SDK.
        """
        import boto3

        if not hasattr(cls, "dynamo_resource"):
            cls.dynamo_resource = boto3.resource(
                "dynamodb",
                endpoint_url=cls.get_dynamo_endpoint(),
                aws_access_key_id=cls.get_dynamo_access_key_id(),
                aws_secret_access_key=cls.get_dynamo_secret_access_key(),
                region_name=cls.get_dynamo_region(),
            )
        return cls.dynamo_resource

    @classmethod
    def get_dynamo_client(cls):
        """
        The dynamo client is a wrapper around the AWS SDK.
        """
        import boto3

        if not hasattr(cls, "dynamo_client"):
            cls.dynamo_client = boto3.client(
                "dynamodb",
                endpoint_url=cls.get_dynamo_endpoint(),
                aws_access_key_id=cls.get_dynamo_access_key_id(),
                aws_secret_access_key=cls.get_dynamo_secret_access_key(),
                region_name=cls.get_dynamo_region(),
            )
        return cls.dynamo_client

    @classmethod
    def get_google_oauth2_session(cls, state: str | None = None):
        """
        The google oauth2 session is a wrapper around the google SDK.
        """
        from authlib.integrations.requests_client import OAuth2Session

        return OAuth2Session(
            client_id=cls.get_google_client_id(),
            client_secret=cls.get_google_client_secret(),
            state=state,
            scope="openid email",
        )

    @classmethod
    def get_torch_device(cls):
        import torch

        try:
            if torch.backends.mps.is_available():
                import torch.mps

                return torch.device("mps")
        except:
            pass

        try:
            import torch.cuda

            if torch.cuda.device_count() > 0:
                return torch.device("cuda")
        except:
            return torch.device("cpu")
