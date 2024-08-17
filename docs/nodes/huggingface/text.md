# nodetool.nodes.huggingface.text

## FillMask

Fills in a masked token in a given text.

Use cases:
- Text completion
- Sentence prediction
- Language understanding tasks
- Generating text options

**Tags:** text, fill-mask, natural language processing

**Fields:**
- **model**: The model ID to use for fill-mask task (FillMaskModelId)
- **inputs**: The input text with [MASK] token to be filled (str)
- **top_k**: Number of top predictions to return (int)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** DataframeRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** DataframeRef


## QuestionAnswering

Answers questions based on a given context.

Use cases:
- Automated customer support
- Information retrieval from documents
- Reading comprehension tasks
- Enhancing search functionality

**Tags:** text, question answering, natural language processing

**Fields:**
- **model**: The model ID to use for question answering (QuestionAnsweringModelId)
- **context**: The context or passage to answer questions from (str)
- **question**: The question to be answered based on the context (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict


## Summarize

**Fields:**
- **model**: The model ID to use for the summarization (SummarizeModelId)
- **inputs**: The input text to the model (str)
- **max_length**: The maximum length of the generated text (int)
- **do_sample**: Whether to sample from the model (bool)

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** str

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** str


## TableQuestionAnswering

Answers questions based on tabular data.

Use cases:
- Querying databases using natural language
- Analyzing spreadsheet data with questions
- Extracting insights from tabular reports
- Automated data exploration

**Tags:** table, question answering, natural language processing

**Fields:**
- **model**: The model ID to use for table question answering (TableQuestionAnsweringModelId)
- **inputs**: The input table to query (DataframeRef)
- **question**: The question to be answered based on the table (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict


## TextClassifier

**Fields:**
- **model**: The model ID to use for the classification (TextClassifierModelId)
- **inputs**: The input text to the model (str)

### get_model_id

**Args:**

### process_local_result

**Args:**
- **contex (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict


## TextGeneration

Generates text based on a given prompt.

Use cases:
- Creative writing assistance
- Automated content generation
- Chatbots and conversational AI
- Code generation and completion

**Tags:** text, generation, natural language processing

**Fields:**
- **model**: The model ID to use for the text generation (TextGenerationModelId)
- **inputs**: The input text prompt for generation (str)
- **max_new_tokens**: The maximum number of new tokens to generate (int)
- **temperature**: Controls randomness in generation. Lower values make it more deterministic. (float)
- **top_p**: Controls diversity of generated text. Lower values make it more focused. (float)
- **do_sample**: Whether to use sampling or greedy decoding (bool)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** str

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** str


## TextToText

Performs text-to-text generation tasks.

Use cases:
- Text translation
- Text summarization
- Paraphrasing
- Text style transfer

**Tags:** text, generation, translation, summarization, natural language processing

**Fields:**
- **model**: The model ID to use for the text-to-text generation (TextToTextModelId)
- **inputs**: The input text for the text-to-text task (str)
- **prefix**: The prefix to specify the task (e.g., 'translate English to French:', 'summarize:') (str)
- **max_length**: The maximum length of the generated text (int)
- **num_return_sequences**: The number of alternative sequences to generate (int)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** list

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** list


## TokenClassification

Performs token classification tasks such as Named Entity Recognition (NER).

Use cases:
- Named Entity Recognition in text
- Part-of-speech tagging
- Chunking and shallow parsing
- Information extraction from unstructured text

**Tags:** text, token classification, named entity recognition, natural language processing

**Fields:**
- **model**: The model ID to use for token classification (TokenClassificationModelId)
- **inputs**: The input text for token classification (str)
- **aggregation_strategy**: Strategy to aggregate tokens into entities (AggregationStrategy)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** DataframeRef

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** DataframeRef


## Translation

Translates text from one language to another.

Use cases:
- Multilingual content creation
- Cross-language communication
- Localization of applications and websites
- International market research

**Tags:** text, translation, natural language processing

**Fields:**
- **inputs**: The text to translate (str)
- **source_lang**: The source language code (e.g., 'en' for English) (LanguageCode)
- **target_lang**: The target language code (e.g., 'fr' for French) (LanguageCode)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_params

**Args:**

### initialize

**Args:**
- **context (typing.Any)**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** str

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** str


## ZeroShotTextClassifier

Performs zero-shot classification on text.

Use cases:
- Classify text into custom categories without training
- Topic detection in documents
- Sentiment analysis with custom sentiment labels
- Intent classification in conversational AI

**Tags:** text, classification, zero-shot, natural language processing

**Fields:**
- **model**: The model ID to use for zero-shot classification (ZeroShotTextClassifierModelId)
- **inputs**: The text to classify (str)
- **candidate_labels**: Comma-separated list of candidate labels for classification (str)
- **multi_label**: Whether to perform multi-label classification (bool)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### get_params

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** dict


