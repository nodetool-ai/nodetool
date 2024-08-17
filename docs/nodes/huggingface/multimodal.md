# nodetool.nodes.huggingface.multimodal

## FeaturesExtraction

Extracts features from text using pre-trained models.

Use cases:
- Text similarity comparison
- Clustering text documents
- Input for machine learning models
- Semantic search applications

**Tags:** text, feature extraction, embeddings, natural language processing

**Fields:**
- **model**: The model ID to use for feature extraction (FeaturesExtractionModelId)
- **inputs**: The text to extract features from (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** Tensor

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** Tensor


## ImageFeatureExtraction

Extracts features from images using pre-trained models.

Use cases:
- Image similarity comparison
- Clustering images
- Input for machine learning models
- Content-based image retrieval

**Tags:** image, feature extraction, embeddings, computer vision

**Fields:**
- **model**: The model ID to use for image feature extraction (ImageFeatureExtractionModelId)
- **inputs**: The image to extract features from (ImageRef)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

**Args:**

### process_local_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** Tensor

### process_remote_result

**Args:**
- **context (ProcessingContext)**
- **result (typing.Any)**

**Returns:** Tensor


## ImageToText

Generates text descriptions from images.

Use cases:
- Automatic image captioning
- Assisting visually impaired users
- Enhancing image search capabilities
- Generating alt text for web images

**Tags:** image, text, captioning, vision-language

**Fields:**
- **model**: The model ID to use for image-to-text generation (ImageToTextModelId)
- **inputs**: The image to generate text from (ImageRef)
- **max_new_tokens**: The maximum number of tokens to generate (int)

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


## MaskGeneration

Generates masks for images using segmentation models.

Use cases:
- Object segmentation in images
- Background removal
- Image editing and manipulation
- Scene understanding and analysis

**Tags:** image, segmentation, mask generation, computer vision

**Fields:**
- **model**: The model ID to use for mask generation (MaskGenerationModelId)
- **inputs**: The image to generate masks for (ImageRef)
- **points_per_side**: Number of points to be sampled along each side of the image (int)

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


## VisualQuestionAnswering

Answers questions about images.

Use cases:
- Image content analysis
- Automated image captioning
- Visual information retrieval
- Accessibility tools for visually impaired users

**Tags:** image, text, question answering, multimodal

**Fields:**
- **model**: The model ID to use for visual question answering (VisualQuestionAnsweringModelId)
- **image**: The image to analyze (ImageRef)
- **question**: The question to be answered about the image (str)

### get_inputs

**Args:**
- **context (ProcessingContext)**

### get_model_id

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


