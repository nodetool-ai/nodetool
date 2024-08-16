# nodetool.nodes.huggingface.multimodal

## FeaturesExtraction

Extracts features from text using pre-trained models.

Use cases:
- Text similarity comparison
- Clustering text documents
- Input for machine learning models
- Semantic search applications

**Fields:**
model: FeaturesExtractionModelId
inputs: str

## ImageFeatureExtraction

Extracts features from images using pre-trained models.

Use cases:
- Image similarity comparison
- Clustering images
- Input for machine learning models
- Content-based image retrieval

**Fields:**
model: ImageFeatureExtractionModelId
inputs: ImageRef

## ImageToText

Generates text descriptions from images.

Use cases:
- Automatic image captioning
- Assisting visually impaired users
- Enhancing image search capabilities
- Generating alt text for web images

**Fields:**
model: ImageToTextModelId
inputs: ImageRef
max_new_tokens: int

## MaskGeneration

Generates masks for images using segmentation models.

Use cases:
- Object segmentation in images
- Background removal
- Image editing and manipulation
- Scene understanding and analysis

**Fields:**
model: MaskGenerationModelId
inputs: ImageRef
points_per_side: int

## VisualQuestionAnswering

Answers questions about images.

Use cases:
- Image content analysis
- Automated image captioning
- Visual information retrieval
- Accessibility tools for visually impaired users

**Fields:**
model: VisualQuestionAnsweringModelId
image: ImageRef
question: str

