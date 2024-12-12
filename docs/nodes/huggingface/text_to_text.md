# nodetool.nodes.huggingface.text_to_text

## TextToText

Performs text-to-text generation tasks.

Use cases:
- Text translation
- Text summarization
- Paraphrasing
- Text style transfer

Usage:
Start with a command like Translate, Summarize, or Q (for question)
Follow with the text you want to translate, summarize, or answer a question about.
Examples:
- Translate to German: Hello
- Summarize: The quick brown fox jumps over the lazy dog.
- Q: Who ate the cookie? followed by the text of the cookie monster.

**Tags:** text, generation, translation, question-answering, summarization, nlp, natural-language-processing

**Fields:**
- **model**: The model ID to use for the text-to-text generation (HFText2TextGeneration)
- **text**: The input text for the text-to-text task (str)
- **max_length**: The maximum length of the generated text (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


