# nodetool.common.settings

## SecretsModel

**Fields:**
- **OPENAI_API_KEY**: OpenAI API key (str | None)
- **ANTHROPIC_API_KEY**: ANTHROPIC API key (str | None)
- **HF_TOKEN**: Hugging Face Token (str | None)
- **REPLICATE_API_TOKEN**: Replicate API Token (str | None)


## SettingsModel

**Fields:**
- **COMFY_FOLDER**: Location of ComfyUI folder (str | None)


### get_system_file_path

Returns the path to the settings file for the current OS.
**Args:**
- **filename (str)**

**Returns:** Path

### get_value

Get the value of an environment variable, or a default value.

If the environment variable is not set, and the key is not in the
default values, raise an exception.
**Args:**
- **key (str)**
- **settings (SettingsModel)**
- **secrets (SecretsModel)**
- **default_env (typing.Dict[str, typing.Any])**
- **default (Any) (default: <object object at 0x000001BF372F4730>)**

**Returns:** Any

### load_settings

Load the settings from the settings file and the secrets from the secrets file.
### save_settings

Save the user settings to the settings file and the user secrets to the secrets file.
**Args:**
- **settings (SettingsModel)**
- **secrets (SecretsModel)**

### setup_settings

Runs the configuration wizard to set up the environment.
**Args:**
- **settings (SettingsModel)**
- **secrets (SecretsModel)**
- **default_env (typing.Dict[str, typing.Any])**

**Returns:** typing.Tuple[nodetool.common.settings.SettingsModel, nodetool.common.settings.SecretsModel]

