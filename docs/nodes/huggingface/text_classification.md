# nodetool.nodes.huggingface.text_classification

## TextClassifier

**Fields:**
- **model**: The model ID to use for the classification (HFTextClassification)
- **prompt**: The input text to the model (str)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## ZeroShotTextClassifier

Performs zero-shot classification on text.

Use cases:
- Classify text into custom categories without training
- Topic detection in documents
- Sentiment analysis with custom sentiment labels
- Intent classification in conversational AI

**Tags:** text, classification, zero-shot, natural language processing

**Fields:**
- **model**: The model ID to use for zero-shot classification (HFZeroShotClassification)
- **inputs**: The text to classify (str)
- **candidate_labels**: Comma-separated list of candidate labels for classification (str)
- **multi_label**: Whether to perform multi-label classification (bool)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


