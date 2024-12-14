# nodetool.nodes.nodetool.image.enhance

## AdaptiveContrast

Applies localized contrast enhancement using adaptive techniques.

Use cases:
- Improve visibility in images with varying lighting conditions
- Prepare images for improved feature detection in computer vision

**Tags:** image, contrast, enhance

**Fields:**
- **image**: The image to adjust the contrast for. (ImageRef)
- **clip_limit**: Clip limit for adaptive contrast. (float)
- **grid_size**: Grid size for adaptive contrast. (int)


## AutoContrast

Automatically adjusts image contrast for enhanced visual quality.

Use cases:
- Enhance image clarity for better visual perception
- Pre-process images for computer vision tasks
- Improve photo aesthetics in editing workflows

**Tags:** image, contrast, balance

**Fields:**
- **image**: The image to adjust the contrast for. (ImageRef)
- **cutoff**: Represents the percentage of pixels to ignore at both the darkest and lightest ends of the histogram. A cutoff value of 5 means ignoring the darkest 5% and the lightest 5% of pixels, enhancing overall contrast by stretching the remaining pixel values across the full brightness range. (int)


## Brightness

Adjusts overall image brightness to lighten or darken.

Use cases:
- Correct underexposed or overexposed photographs
- Enhance visibility of dark image regions
- Prepare images for consistent display across devices

**Tags:** image, brightness, enhance

**Fields:**
- **image**: The image to adjust the brightness for. (ImageRef)
- **factor**: Factor to adjust the brightness. 1.0 means no change. (float | int)


## Color

Adjusts color intensity of an image.

Use cases:
- Enhance color vibrancy in photographs
- Correct color imbalances in digital images
- Prepare images for consistent brand color representation

**Tags:** image, color, enhance

**Fields:**
- **image**: The image to adjust the brightness for. (ImageRef)
- **factor**: Factor to adjust the contrast. 1.0 means no change. (float)


## Contrast

Adjusts image contrast to modify light-dark differences.

Use cases:
- Enhance visibility of details in low-contrast images
- Prepare images for visual analysis or recognition tasks
- Create dramatic effects in artistic photography

**Tags:** image, contrast, enhance

**Fields:**
- **image**: The image to adjust the brightness for. (ImageRef)
- **factor**: Factor to adjust the contrast. 1.0 means no change. (float)


## Detail

Enhances fine details in images.

Use cases:
- Improve clarity of textural elements in photographs
- Enhance visibility of small features for analysis
- Prepare images for high-resolution display or printing

**Tags:** image, detail, enhance

**Fields:**
- **image**: The image to detail. (ImageRef)


## EdgeEnhance

Enhances edge visibility by increasing contrast along boundaries.

Use cases:
- Improve object boundary detection for computer vision
- Highlight structural elements in technical drawings
- Prepare images for feature extraction in image analysis

**Tags:** image, edge, enhance

**Fields:**
- **image**: The image to edge enhance. (ImageRef)


## Equalize

Enhances image contrast by equalizing intensity distribution.

Use cases:
- Improve visibility in poorly lit images
- Enhance details for image analysis tasks
- Normalize image data for machine learning

**Tags:** image, contrast, histogram

**Fields:**
- **image**: The image to equalize. (ImageRef)


## RankFilter

Applies rank-based filtering to enhance or smooth image features.

Use cases:
- Reduce noise while preserving edges in images
- Enhance specific image features based on local intensity
- Pre-process images for improved segmentation results

**Tags:** image, filter, enhance

**Fields:**
- **image**: The image to rank filter. (ImageRef)
- **size**: Rank filter size. (int)
- **rank**: Rank filter rank. (int)


## Sharpen

Enhances image detail by intensifying local pixel contrast.

Use cases:
- Improve clarity of photographs for print or display
- Refine texture details in product photography
- Enhance readability of text in document images

**Tags:** image, sharpen, clarity

**Fields:**
- **image**: The image to sharpen. (ImageRef)


## Sharpness

Adjusts image sharpness to enhance or reduce detail clarity.

Use cases:
- Enhance photo details for improved visual appeal
- Refine images for object detection tasks
- Correct slightly blurred images

**Tags:** image, clarity, sharpness

**Fields:**
- **image**: The image to adjust the brightness for. (ImageRef)
- **factor**: Factor to adjust the contrast. 1.0 means no change. (float)


## UnsharpMask

Sharpens images using the unsharp mask technique.

Use cases:
- Enhance edge definition in photographs
- Improve perceived sharpness of digital artwork
- Prepare images for high-quality printing or display

**Tags:** image, sharpen, enhance

**Fields:**
- **image**: The image to unsharp mask. (ImageRef)
- **radius**: Unsharp mask radius. (int)
- **percent**: Unsharp mask percent. (int)
- **threshold**: Unsharp mask threshold. (int)


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

