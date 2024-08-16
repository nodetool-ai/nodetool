# nodetool.nodes.huggingface.text

## FillMask

Fills in a masked token in a given text.

Use cases:
- Text completion
- Sentence prediction
- Language understanding tasks
- Generating text options

**Fields:**
model: FillMaskModelId
inputs: str
top_k: int

## QuestionAnswering

Answers questions based on a given context.

Use cases:
- Automated customer support
- Information retrieval from documents
- Reading comprehension tasks
- Enhancing search functionality

**Fields:**
model: QuestionAnsweringModelId
context: str
question: str

## Summarize

**Fields:**
model: SummarizeModelId
inputs: str
max_length: int
do_sample: bool

## TableQuestionAnswering

Answers questions based on tabular data.

Use cases:
- Querying databases using natural language
- Analyzing spreadsheet data with questions
- Extracting insights from tabular reports
- Automated data exploration

**Fields:**
model: TableQuestionAnsweringModelId
inputs: DataframeRef
question: str

## TextClassifier

**Fields:**
model: TextClassifierModelId
inputs: str

## TextGeneration

Generates text based on a given prompt.

Use cases:
- Creative writing assistance
- Automated content generation
- Chatbots and conversational AI
- Code generation and completion

**Fields:**
model: TextGenerationModelId
inputs: str
max_new_tokens: int
temperature: float
top_p: float
do_sample: bool

## TextToText

Performs text-to-text generation tasks.

Use cases:
- Text translation
- Text summarization
- Paraphrasing
- Text style transfer

**Fields:**
model: TextToTextModelId
inputs: str
prefix: str
max_length: int
num_return_sequences: int

## TokenClassification

Performs token classification tasks such as Named Entity Recognition (NER).

Use cases:
- Named Entity Recognition in text
- Part-of-speech tagging
- Chunking and shallow parsing
- Information extraction from unstructured text

**Fields:**
model: TokenClassificationModelId
inputs: str
aggregation_strategy: AggregationStrategy

## Translation

Translates text from one language to another.

Use cases:
- Multilingual content creation
- Cross-language communication
- Localization of applications and websites
- International market research

**Fields:**
inputs: str
source_lang: LanguageCode
target_lang: LanguageCode

## ZeroShotTextClassifier

Performs zero-shot classification on text.

Use cases:
- Classify text into custom categories without training
- Topic detection in documents
- Sentiment analysis with custom sentiment labels
- Intent classification in conversational AI

**Fields:**
model: ZeroShotTextClassifierModelId
inputs: str
candidate_labels: str
multi_label: bool

