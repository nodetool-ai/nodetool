import os
import yaml
from pathlib import Path
from typing import Any, Dict, Tuple
from pydantic import BaseModel, Field

# Constants
SETTINGS_FILE = "settings.yaml"
SECRETS_FILE = "secrets.yaml"
MISSING_MESSAGE = "Missing required environment variable: {}"
NOT_GIVEN = object()


class SettingsModel(BaseModel):
    COMFY_FOLDER: str | None = Field(
        default=None, description="Location of ComfyUI folder"
    )
    CHROMA_PATH: str | None = Field(
        default=None, description="Location of ChromaDB folder"
    )
    ASSET_FOLDER: str | None = Field(
        default=None, description="Location of asset folder"
    )


class SecretsModel(BaseModel):
    OPENAI_API_KEY: str | None = Field(default=None, description="OpenAI API key")
    ANTHROPIC_API_KEY: str | None = Field(default=None, description="ANTHROPIC API key")
    HF_TOKEN: str | None = Field(default=None, description="Hugging Face Token")
    REPLICATE_API_TOKEN: str | None = Field(
        default=None, description="Replicate API Token"
    )
    KLING_ACCESS_KEY: str | None = Field(
        default=None, description="Kling AI access key"
    )
    KLING_SECRET_KEY: str | None = Field(
        default=None, description="Kling AI secret key"
    )
    LUMAAI_API_KEY: str | None = Field(default=None, description="Luma AI API key")
    AIME_USER: str | None = Field(default=None, description="Aime user")
    AIME_API_KEY: str | None = Field(default=None, description="Aime API key")


def get_system_file_path(filename: str) -> Path:
    """
    Returns the path to the settings file for the current OS.
    """
    import platform

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


def load_settings() -> Tuple[SettingsModel, SecretsModel]:
    """
    Load the settings from the settings file and the secrets from the secrets file.
    """
    settings_file = get_system_file_path(SETTINGS_FILE)
    secrets_file = get_system_file_path(SECRETS_FILE)

    settings = {}
    secrets = {}

    if settings_file.exists():
        with open(settings_file, "r") as f:
            settings = yaml.safe_load(f) or {}

    if secrets_file.exists():
        with open(secrets_file, "r") as f:
            secrets = yaml.safe_load(f) or {}

    return SettingsModel(**settings), SecretsModel(**secrets)


def save_settings(settings: SettingsModel, secrets: SecretsModel):
    """
    Save the user settings to the settings file and the user secrets to the secrets file.
    """
    settings_file = get_system_file_path(SETTINGS_FILE)
    secrets_file = get_system_file_path(SECRETS_FILE)

    print(f"Saving settings to {settings_file}")
    print(f"Saving secrets to {secrets_file}")

    os.makedirs(os.path.dirname(settings_file), exist_ok=True)
    os.makedirs(os.path.dirname(secrets_file), exist_ok=True)

    with open(settings_file, "w") as f:
        yaml.dump(settings.model_dump(), f)

    with open(secrets_file, "w") as f:
        yaml.dump(secrets.model_dump(), f)


def get_value(
    key: str,
    settings: SettingsModel,
    secrets: SecretsModel,
    default_env: Dict[str, Any],
    default: Any = NOT_GIVEN,
) -> Any:
    """
    Get the value of an environment variable, or a default value.

    If the environment variable is not set, and the key is not in the
    default values, raise an exception.
    """
    value = secrets.model_dump().get(key) or settings.model_dump().get(key)
    if value is None or str(value) == "":
        value = os.environ.get(key)

    if value is None:
        value = default_env.get(key, default)

    if value is not NOT_GIVEN:
        return value
    else:
        raise Exception(MISSING_MESSAGE.format(key))
