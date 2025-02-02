# nodetool.common.settings

## SecretsModel

**Fields:**
- **OPENAI_API_KEY**: OpenAI API key (str | None)
- **ANTHROPIC_API_KEY**: ANTHROPIC API key (str | None)
- **HF_TOKEN**: Hugging Face Token (str | None)
- **REPLICATE_API_TOKEN**: Replicate API Token (str | None)
- **AIME_USER**: Aime user (str | None)
- **AIME_API_KEY**: Aime API key (str | None)
- **GOOGLE_MAIL_USER**: Google mail user (str | None)
- **GOOGLE_APP_PASSWORD**: Google app password (str | None)
- **GEMINI_API_KEY**: Gemini API key (str | None)
- **ELEVENLABS_API_KEY**: ElevenLabs API key (str | None)
- **FAL_API_KEY**: FAL API key (str | None)


## SettingsModel

**Fields:**
- **FONT_PATH**: Location of font folder (str | None)
- **COMFY_FOLDER**: Location of ComfyUI folder (str | None)
- **CHROMA_PATH**: Location of ChromaDB folder (str | None)


### get_system_data_path

Returns the path to the data folder for the current OS.
**Args:**
- **filename (str)**

**Returns:** Path

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
- **default (Any) (default: <object object at 0x15ed8b7c0>)**

**Returns:** Any

### load_settings

Load the settings from the settings file and the secrets from the secrets file.
### save_settings

Save the user settings to the settings file and the user secrets to the secrets file.
**Args:**
- **settings (SettingsModel)**
- **secrets (SecretsModel)**

