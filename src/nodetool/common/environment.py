import os
from pathlib import Path
from typing import Any

from nodetool.common.nodetool_api_client import (
    NodetoolAPIClient,
    NODETOOL_INTERNAL_API,
)
from nodetool.models.database_adapter import DatabaseAdapter
from nodetool.storage.abstract_node_cache import AbstractNodeCache


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
    "ASSET_DOMAIN": None,
    "TEMP_DOMAIN": None,
    "CHROMA_URL": None,
    "CHROMA_PATH": str(get_data_path("chroma")),
    "COMFY_FOLDER": None,
    "ASSET_FOLDER": str(get_data_path("assets")),
    "MEMCACHE_HOST": None,
    "MEMCACHE_PORT": None,
    "DB_PATH": str(get_data_path("nodetool.sqlite3")),
    "REPLICATE_API_TOKEN": None,
    "OPENAI_API_KEY": None,
    "OLLAMA_API_URL": "http://localhost:11434",
    "HF_TOKEN": None,
    "ENV": "development",
    "LOG_LEVEL": "INFO",
    "REMOTE_AUTH": "0",
    "DEBUG": None,
    "USE_NGROK": None,
    "AWS_REGION": "us-east-1",
    "NODETOOL_API_URL": None,
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

NOT_GIVEN = object()


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
    def get(cls, key: str, default: Any = NOT_GIVEN):
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
        elif default is not NOT_GIVEN:
            return default
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
    def get_memcache_host(cls):
        """
        The memcache host is the host of the memcache server.
        """
        return os.environ.get("MEMCACHE_HOST")

    @classmethod
    def get_memcache_port(cls):
        """
        The memcache port is the port of the memcache server.
        """
        return os.environ.get("MEMCACHE_PORT")

    @classmethod
    def set_node_cache(cls, node_cache: AbstractNodeCache):
        cls.node_cache = node_cache

    @classmethod
    def get_node_cache(cls) -> AbstractNodeCache:
        memcache_host = cls.get_memcache_host()
        memcache_port = cls.get_memcache_port()

        if not hasattr(cls, "node_cache"):
            if memcache_host and memcache_port:
                from nodetool.storage.memcache_node_cache import MemcachedNodeCache

                cls.node_cache = MemcachedNodeCache(
                    host=memcache_host, port=int(memcache_port)
                )
            else:
                from nodetool.storage.memory_node_cache import MemoryNodeCache

                cls.node_cache = MemoryNodeCache()

        return cls.node_cache

    @classmethod
    def get_db_path(cls):
        """
        The database url is the url of the database.
        """
        return cls.get("DB_PATH")

    @classmethod
    def get_postgres_params(cls):
        """
        The postgres params are the parameters that we use to connect to the database.
        """
        return {
            "database": cls.get("POSTGRES_DB"),
            "user": cls.get("POSTGRES_USER"),
            "password": cls.get("POSTGRES_PASSWORD"),
            "host": cls.get("POSTGRES_HOST"),
            "port": cls.get("POSTGRES_PORT"),
        }

    @classmethod
    def get_database_adapter(
        cls, fields: dict[str, Any], table_schema: dict[str, Any]
    ) -> DatabaseAdapter:
        """
        The database adapter is the adapter that we use to connect to the database.
        """

        if cls.get("POSTGRES_DB", None) is not None:
            from nodetool.models.postgres_adapter import PostgresAdapter

            return PostgresAdapter(
                db_params=cls.get_postgres_params(),
                fields=fields,
                table_schema=table_schema,
            )
        elif cls.get_db_path() is not None:
            from nodetool.models.sqlite_adapter import SQLiteAdapter

            if cls.get_db_path() != ":memory:":
                os.makedirs(os.path.dirname(cls.get_db_path()), exist_ok=True)

            return SQLiteAdapter(
                db_path=cls.get_db_path(),
                fields=fields,
                table_schema=table_schema,
            )
        else:
            raise Exception("No database adapter configured")

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
        return os.environ.get("S3_ACCESS_KEY_ID", None)

    @classmethod
    def get_s3_secret_access_key(cls):
        """
        The secret access key is the secret of the AWS user.
        """
        # If we are in production, we don't need a secret access key.
        # We use the IAM role instead.
        return os.environ.get("S3_SECRET_ACCESS_KEY", None)

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
    def get_asset_domain(cls):
        """
        The asset domain is the domain where assets are stored.
        """
        return cls.get("ASSET_DOMAIN")

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
    def get_storage_api_url(cls):
        """
        The storage API endpoint.
        """
        if cls.get_nodetool_api_url():
            return f"{cls.get_nodetool_api_url()}/storage/"
        else:
            return "http://localhost:8000/api/storage/"

    @classmethod
    def get_nodetool_api_client(
        cls, user_id: str, auth_token: str, api_url: str | None = None
    ) -> NodetoolAPIClient:
        """
        The nodetool api client is a wrapper around the nodetool api.
        """
        from nodetool.api.server import create_app
        from httpx import AsyncClient, ASGITransport

        if api_url is None:
            api_url = cls.get_nodetool_api_url()

        if not hasattr(cls, "nodetool_api_client"):
            if api_url is not None:
                cls.nodetool_api_client = NodetoolAPIClient(
                    user_id=user_id,
                    auth_token=auth_token,
                    base_url=api_url,
                    client=AsyncClient(timeout=30),
                )
            else:
                app = create_app()
                transport = ASGITransport(app=app)  # type: ignore
                cls.nodetool_api_client = NodetoolAPIClient(
                    user_id=user_id,
                    auth_token=auth_token,
                    base_url=NODETOOL_INTERNAL_API,
                    client=AsyncClient(transport=transport),
                )
        return cls.nodetool_api_client

    @classmethod
    def get_openai_client(cls):
        from openai import AsyncClient

        return AsyncClient(api_key=cls.get_openai_api_key())

    @classmethod
    def get_anthropic_client(cls):
        from anthropic import AsyncAnthropic

        return AsyncAnthropic(api_key=cls.get_anthropic_api_key())

    @classmethod
    def get_ollama_api_url(cls):
        """
        The ollama api url is the url of the ollama api server.
        """
        return cls.get("OLLAMA_API_URL")

    @classmethod
    def get_ollama_client(cls):
        from ollama import AsyncClient

        print("using ollama url", cls.get_ollama_api_url())

        return AsyncClient(cls.get_ollama_api_url())

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
    def get_llama_function_models(cls):
        from nodetool.metadata.types import (
            FunctionModel,
            Provider,
        )
        import ollama

        models = ollama.list()["models"]
        return [
            FunctionModel(provider=Provider.Ollama, name=model["name"])
            for model in models
            if model["name"].startswith("mistra")
        ]

    @classmethod
    def get_function_models(cls):
        from nodetool.metadata.types import (
            FunctionModel,
            GPTModel,
            AnthropicModel,
            Provider,
        )

        models = [
            FunctionModel(
                provider=Provider.OpenAI,
                name=GPTModel.GPT4.value,
            ),
            FunctionModel(
                provider=Provider.Anthropic, name=AnthropicModel.claude_3_opus
            ),
        ]

        if not cls.is_production():
            # TODO: hardcode list of models for production
            models += cls.get_llama_function_models()

        return models

    @classmethod
    async def get_llama_models(cls):
        from nodetool.metadata.types import LlamaModel

        ollama = Environment.get_ollama_client()
        models = await ollama.list()

        return [LlamaModel(**model) for model in models["models"]]

    @classmethod
    def get_model_files(cls, folder: str):
        """
        Get the files in a model folder.
        """
        if len(cls.model_files) > 0:
            return cls.model_files.get(folder, [])
        else:
            import folder_paths

            return folder_paths.get_filename_list(folder)

    @classmethod
    def get_comfy_folder(cls):
        """
        The comfy folder is the folder where ComfyUI is located.
        """
        return cls.get("COMFY_FOLDER")

    @classmethod
    def get_sd_url(cls):
        """
        The url of the stable diffusion service.
        """
        return cls.get("SD_URL")

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
    def get_s3_storage(cls, bucket: str, domain: str | None = None):
        """
        Get the S3 service.
        """
        from nodetool.storage.s3_storage import S3Storage
        import boto3

        endpoint_url = cls.get_s3_endpoint_url()
        access_key_id = cls.get_s3_access_key_id()
        secret_access_key = cls.get_s3_secret_access_key()

        assert access_key_id is not None, "AWS access key ID is required"
        assert secret_access_key is not None, "AWS secret access key is required"
        assert endpoint_url is not None, "S3 endpoint URL is required"

        client = boto3.client(
            "s3",
            region_name=cls.get_s3_region(),
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )

        return S3Storage(
            bucket_name=bucket,
            domain=domain,
            endpoint_url=endpoint_url,
            client=client,
        )

    @classmethod
    def get_asset_storage(cls, use_s3: bool = False):
        """
        Get the storage adapter for assets.
        """
        if not hasattr(cls, "asset_storage"):
            if cls.is_production() or cls.get_s3_access_key_id() is not None or use_s3:
                return cls.get_s3_storage(
                    cls.get_asset_bucket(), cls.get_asset_domain()
                )
            else:
                from nodetool.storage.file_storage import FileStorage

                base_url = cls.get_storage_api_url() + cls.get_asset_bucket()
                if cls.is_test():
                    from nodetool.storage.memory_storage import MemoryStorage

                    cls.asset_storage = MemoryStorage(base_url=base_url)
                else:
                    cls.get_logger().info(f"Using local file storage for asset storage")
                    cls.asset_storage = FileStorage(
                        base_path=cls.get_asset_folder(),
                        base_url=base_url,
                    )

        assert cls.asset_storage is not None
        return cls.asset_storage

    @classmethod
    def get_logger(cls):
        """
        Get a logger.
        """
        import logging

        if not hasattr(cls, "logger"):
            cls.logger = logging.getLogger("nodetool")
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
