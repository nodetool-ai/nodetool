# nodetool.nodes.huggingface.translation

## Translation

Translates text from one language to another.

Use cases:
- Multilingual content creation
- Cross-language communication
- Localization of applications and websites

Note: some models support more languages than others.

**Tags:** text, translation, natural language processing

**Fields:**
- **model**: The model ID to use for translation (HFTranslation)
- **inputs**: The text to translate (str)
- **source_lang**: The source language code (e.g., 'en' for English) (LanguageCode)
- **target_lang**: The target language code (e.g., 'fr' for French) (LanguageCode)

### initialize

Initializes the translation pipeline by loading the specified model.
**Args:**
- **context (ProcessingContext)**

### move_to_device

Moves the pipeline's model and components to the specified device.


**Args:**

- **target_device_str (str)**: The target device (e.g., "cpu", "cuda", "cuda:0").
**Args:**
- **target_device_str (str)**


