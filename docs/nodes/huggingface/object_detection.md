# nodetool.nodes.huggingface.object_detection

## ObjectDetection

Detects and localizes objects in images.

Use cases:
- Identify and count objects in images
- Locate specific items in complex scenes
- Assist in autonomous vehicle vision systems
- Enhance security camera footage analysis

**Tags:** image, object detection, bounding boxes, huggingface

**Fields:**
- **model**: The model ID to use for object detection (HFObjectDetection)
- **image**: The input image for object detection (ImageRef)
- **threshold**: Minimum confidence score for detected objects (float)
- **top_k**: The number of top predictions to return (int)

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


## VisualizeObjectDetection

Visualizes object detection results on images.

**Tags:** image, object detection, bounding boxes, visualization, mask

**Fields:**
- **image**: The input image to visualize (ImageRef)
- **objects**: The detected objects to visualize (list[nodetool.metadata.types.ObjectDetectionResult])

### required_inputs

**Args:**


## ZeroShotObjectDetection

Detects objects in images without the need for training data.

Use cases:
- Quickly detect objects in images without training data
- Identify objects in images without predefined labels
- Automate object detection for large datasets

**Tags:** image, object detection, bounding boxes, zero-shot, mask

**Fields:**
- **model**: The model ID to use for object detection (HFZeroShotObjectDetection)
- **image**: The input image for object detection (ImageRef)
- **threshold**: Minimum confidence score for detected objects (float)
- **top_k**: The number of top predictions to return (int)
- **candidate_labels**: The candidate labels to detect in the image, separated by commas (str)

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


