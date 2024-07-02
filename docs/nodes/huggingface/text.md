# nodetool.nodes.huggingface.text

## Classifier

Text Classification is the task of assigning a label or class to a given text. Some use cases are sentiment analysis, natural language inference, and assessing grammatical correctness.

### Use Cases
* You can track the sentiments of your customers from the product reviews using sentiment analysis models. This can help understand churn and retention by grouping reviews by sentiment, to later analyze the text and make strategic decisions based on this knowledge.

**Tags:** classifier, text, huggingface

**Inherits from:** HuggingfaceNode

- **model**: The model ID to use for the classification (`ModelId`)
- **inputs**: The input text to classify (`str`)

## Summarize

Summarization is the task of producing a shorter version of a document while preserving its important information. Some models can extract text from the original input, while other models can generate entirely new text.

### Use Cases
Research papers can be summarized to allow researchers to spend less time selecting which articles to read. There are several approaches you can take for a task like this:

Use an existing extractive summarization model on the Hub to do inference.
Pick an existing language model trained for academic papers. This model can then be trained in a process called fine-tuning so it can solve the summarization task.
Use a sequence-to-sequence model like T5 for abstractive text summarization.

**Tags:** text, summarization, huggingface

**Inherits from:** HuggingfaceNode

- **model**: The model ID to use for the summarization (`ModelId`)
- **inputs**: The input text to the model (`str`)

## TextGeneration

Generating text is the task of generating new text given another text. These models can, for example, fill in incomplete text or paraphrase.

Use Cases
* A model trained for text generation can be later adapted to follow instructions. One of the most used open-source models for instruction is OpenAssistant, which you can try at Hugging Chat.

* A Text Generation model, also known as a causal language model, can be trained on code from scratch to help the programmers in their repetitive coding tasks. One of the most popular open-source models for code generation is StarCoder, which can generate code in 80+ languages. You can try it here.

* A story generation model can receive an input like "Once upon a time" and proceed to create a story-like text based on those first words. You can try this application which contains a model trained on story generation, by MosaicML.

**Tags:** text, generation, huggingface, llm, language model

**Inherits from:** HuggingfaceNode

- **model**: The model ID to use for the classification (`ModelId`)
- **inputs**: The input text to the model (`str`)

