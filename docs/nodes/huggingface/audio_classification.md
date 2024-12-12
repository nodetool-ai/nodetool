# nodetool.nodes.huggingface.audio_classification

## AudioClassifier

Classifies audio into predefined categories.

Use cases:
- Classify music genres
- Detect speech vs. non-speech audio
- Identify environmental sounds
- Emotion recognition in speech

Recommended models
- MIT/ast-finetuned-audioset-10-10-0.4593
- ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition

**Tags:** audio, classification, labeling, categorization

**Fields:**
- **model**: The model ID to use for audio classification (HFAudioClassification)
- **audio**: The input audio to classify (AudioRef)
- **top_k**: The number of top results to return (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


## ZeroShotAudioClassifier

Classifies audio into categories without the need for training data.

Use cases:
- Quickly categorize audio without training data
- Identify sounds or music genres without predefined labels
- Automate audio tagging for large datasets

**Tags:** audio, classification, labeling, categorization, zero-shot

**Fields:**
- **model**: The model ID to use for the classification (HFZeroShotAudioClassification)
- **audio**: The input audio to classify (AudioRef)
- **candidate_labels**: The candidate labels to classify the audio against, separated by commas (str)

### get_model_id

**Args:**

### get_params

**Args:**

### initialize

**Args:**
- **context (ProcessingContext)**

### required_inputs

**Args:**


