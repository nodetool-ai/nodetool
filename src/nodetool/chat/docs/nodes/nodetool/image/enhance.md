# nodetool.nodes.nodetool.image.enhance

## AdaptiveContrast

Applies localized contrast enhancement using adaptive techniques.

Use cases:
- Improve visibility in images with varying lighting conditions
- Prepare images for improved feature detection in computer vision

**Fields:**
image: ImageRef
clip_limit: float
grid_size: int

## AutoContrast

Automatically adjusts image contrast for enhanced visual quality.

Use cases:
- Enhance image clarity for better visual perception
- Pre-process images for computer vision tasks
- Improve photo aesthetics in editing workflows

**Fields:**
image: ImageRef
cutoff: int

## Brightness

Adjusts overall image brightness to lighten or darken.

Use cases:
- Correct underexposed or overexposed photographs
- Enhance visibility of dark image regions
- Prepare images for consistent display across devices

**Fields:**
image: ImageRef
factor: float | int

## Color

Adjusts color intensity of an image.

Use cases:
- Enhance color vibrancy in photographs
- Correct color imbalances in digital images
- Prepare images for consistent brand color representation

**Fields:**
image: ImageRef
factor: float

## Contrast

Adjusts image contrast to modify light-dark differences.

Use cases:
- Enhance visibility of details in low-contrast images
- Prepare images for visual analysis or recognition tasks
- Create dramatic effects in artistic photography

**Fields:**
image: ImageRef
factor: float

## Detail

Enhances fine details in images.

Use cases:
- Improve clarity of textural elements in photographs
- Enhance visibility of small features for analysis
- Prepare images for high-resolution display or printing

**Fields:**
image: ImageRef

## EdgeEnhance

Enhances edge visibility by increasing contrast along boundaries.

Use cases:
- Improve object boundary detection for computer vision
- Highlight structural elements in technical drawings
- Prepare images for feature extraction in image analysis

**Fields:**
image: ImageRef

## Equalize

Enhances image contrast by equalizing intensity distribution.

Use cases:
- Improve visibility in poorly lit images
- Enhance details for image analysis tasks
- Normalize image data for machine learning

**Fields:**
image: ImageRef

## RankFilter

Applies rank-based filtering to enhance or smooth image features.

Use cases:
- Reduce noise while preserving edges in images
- Enhance specific image features based on local intensity
- Pre-process images for improved segmentation results

**Fields:**
image: ImageRef
size: int
rank: int

## Sharpen

Enhances image detail by intensifying local pixel contrast.

Use cases:
- Improve clarity of photographs for print or display
- Refine texture details in product photography
- Enhance readability of text in document images

**Fields:**
image: ImageRef

## Sharpness

Adjusts image sharpness to enhance or reduce detail clarity.

Use cases:
- Enhance photo details for improved visual appeal
- Refine images for object detection tasks
- Correct slightly blurred images

**Fields:**
image: ImageRef
factor: float

## UnsharpMask

Sharpens images using the unsharp mask technique.

Use cases:
- Enhance edge definition in photographs
- Improve perceived sharpness of digital artwork
- Prepare images for high-quality printing or display

**Fields:**
image: ImageRef
radius: int
percent: int
threshold: int

### adaptive_contrast

**Args:**
- **image (Image)**
- **clip_limit (float)**
- **grid_size (int)**

**Returns:** Image

### canny_edge_detection

**Args:**
- **image (Image)**
- **low_threshold (int)**
- **high_threshold (int)**

**Returns:** Image

### sharpen_image

**Args:**
- **image (Image)**

**Returns:** Image

