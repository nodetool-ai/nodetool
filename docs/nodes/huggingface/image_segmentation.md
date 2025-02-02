# nodetool.nodes.huggingface.image_segmentation

## FindSegment

Extracts a specific segment from a list of segmentation masks.

**Tags:** image, segmentation, object detection, mask

**Fields:**
- **segments**: The segmentation masks to search (list[nodetool.metadata.types.ImageSegmentationResult])
- **segment_label**: The label of the segment to extract (str)

### required_inputs

**Args:**


## SAM2Segmentation

Performs semantic segmentation on images using SAM2 (Segment Anything Model 2).

Use cases:
- Automatic segmentation of objects in images
- Instance segmentation for computer vision tasks
- Interactive segmentation with point prompts
- Scene understanding and object detection

**Tags:** image, segmentation, object detection, scene parsing, mask

**Fields:**
- **image**: The input image to segment (ImageRef)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


## Segmentation

Performs semantic segmentation on images, identifying and labeling different regions.

Use cases:
- Segmenting objects in images
- Segmenting facial features in images

**Tags:** image, segmentation, object detection, scene parsing

**Fields:**
- **model**: The model ID to use for the segmentation (HFImageSegmentation)
- **image**: The input image to segment (ImageRef)

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


## VisualizeSegmentation

Visualizes segmentation masks on images with labels.

Use cases:
- Visualize results of image segmentation models
- Analyze and compare different segmentation techniques
- Create labeled images for presentations or reports

**Tags:** image, segmentation, visualization, mask

**Fields:**
- **image**: The input image to visualize (ImageRef)
- **segments**: The segmentation masks to visualize (list[nodetool.metadata.types.ImageSegmentationResult])

### generate_color_map

Generate a list of distinct colors.
**Args:**
- **num_colors**

### required_inputs

**Args:**


