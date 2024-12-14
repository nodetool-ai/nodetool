# nodetool.nodes.huggingface.multimodal

## GOTOCR

Performs OCR on images using the GOT-OCR model.

Use cases:
- Text extraction from images
- Document digitization
- Image-based information retrieval
- Accessibility tools for visually impaired users

**Tags:** image, text, OCR, multimodal

**Fields:**
- **model**: The model ID to use for GOT-OCR (HFGOTOCR)
- **image**: The image to perform OCR on (ImageRef)
- **ocr_type**: The type of OCR to perform (OCRType)
- **ocr_box**: Bounding box for fine-grained OCR (optional) (str)
- **ocr_color**: Color for fine-grained OCR (optional) (str)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


## ImageToText

Generates text descriptions from images.

Use cases:
- Automatic image captioning
- Assisting visually impaired users
- Enhancing image search capabilities
- Generating alt text for web images

**Tags:** image, text, captioning, vision-language

**Fields:**
- **model**: The model ID to use for image-to-text generation (HFImageToText)
- **image**: The image to generate text from (ImageRef)
- **max_new_tokens**: The maximum number of tokens to generate (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**

### required_inputs

**Args:**


## OCRType

## VisualQuestionAnswering

Answers questions about images.

Use cases:
- Image content analysis
- Automated image captioning
- Visual information retrieval
- Accessibility tools for visually impaired users

**Tags:** image, text, question answering, multimodal

**Fields:**
- **model**: The model ID to use for visual question answering (HFVisualQuestionAnswering)
- **image**: The image to analyze (ImageRef)
- **question**: The question to be answered about the image (str)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


