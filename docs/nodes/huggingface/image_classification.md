# nodetool.nodes.huggingface.image_classification

## ImageClassifier

Classifies images into predefined categories.

Use cases:
- Content moderation by detecting inappropriate images
- Organizing photo libraries by automatically tagging images

**Tags:** image, classification, labeling, categorization

**Fields:**
- **model**: The model ID to use for the classification (HFImageClassification)
- **image**: The input image to classify (ImageRef)

### get_model_id

**Args:**

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


## ZeroShotImageClassifier

Classifies images into categories without the need for training data.

Use cases:
- Quickly categorize images without training data
- Identify objects in images without predefined labels
- Automate image tagging for large datasets

Recommended models:
- openai/clip-vit-large-patch14
- openai/clip-vit-base-patch16
- openai/clip-vit-base-patch32
- patrickjohncyh/fashion-clip
- laion/CLIP-ViT-H-14-laion2B-s32B-b79K

**Tags:** image, classification, labeling, categorization

**Fields:**
- **model**: The model ID to use for the classification (HFZeroShotImageClassification)
- **image**: The input image to classify (ImageRef)
- **candidate_labels**: The candidate labels to classify the image against, separated by commas (str)

### get_model_id

**Args:**

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


