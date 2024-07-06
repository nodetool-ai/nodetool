# nodetool.nodes.nodetool.image.enhance

## AdaptiveContrast

The Adaptive Contrast Node is used to adjust the contrasting visual aspects of an image.
This node enhances the contrast of the provided image on a localized level by adapting the contrast based on defined grid sizes, which means each section of the image will have its contrast adjusted individually compared to each other. The balance of brightness and darkness in different various parts of the image can be shifted using the clip limit field.

#### Applications
- Enhancing visual interest in an image by adjusting contrast.
- Mitigation of contrasting errors in color-focused or texture-focused AI models.
- For image restoration, where restoring the contrast levels can make old or degraded photos become clearer.

**Tags:** 

- **image**: The image to adjust the contrast for. (`ImageRef`)
- **clip_limit**: Clip limit for adaptive contrast. (`float`)
- **grid_size**: Grid size for adaptive contrast. (`int`)

## AutoContrast

Automatically adjusts image contrast for enhanced visual quality.

Use cases:
1. Enhance image clarity for better visual perception
2. Pre-process images for computer vision tasks
3. Improve photo aesthetics in editing workflows
4. Correct poorly lit or low-contrast images
5. Prepare images for printing or display

**Tags:** image, contrast, balance

- **image**: The image to adjust the contrast for. (`ImageRef`)
- **cutoff**: Cutoff for autocontrast. (`int`)

## Brightness

The Brightness Node is designed to adjust the brightness of an image.

Its main purpose is to alter the brightness of an uploaded image by using a customizable factor. The brightness of an image can influence its clarity and visibility. By changing the brightness levels, we can make portions of an image more visible or less distracting based on our needs.

#### Applications
- Brightness level correction: If an image is too dark or too bright, the Brightness Node can be used to correct the brightness levels to the desired range.
- Highlighting or dimming certain parts of an image: The Brightness Node can be used to increase the visibility of certain parts of an image by enhancing their brightness.

**Tags:** image, highlight, dim

- **image**: The image to adjust the brightness for. (`ImageRef`)
- **factor**: Factor to adjust the brightness. 1.0 means no change. (`float | int`)

## Color

Adjusts color intensity of an image using a factor-based filter.

Use cases:
1. Enhance color vibrancy in photographs
2. Create mood-specific color grading for visual media
3. Correct color imbalances in digital images
4. Highlight specific features in scientific or medical imaging
5. Prepare images for consistent brand color representation

**Tags:** image, color, enhance

- **image**: The image to adjust the brightness for. (`ImageRef`)
- **factor**: Factor to adjust the contrast. 1.0 means no change. (`float`)

## Contrast

Adjusts image contrast to modify light-dark differences.

Use cases:
1. Enhance visibility of details in low-contrast images
2. Prepare images for visual analysis or recognition tasks
3. Create dramatic effects in artistic photography
4. Correct over or underexposed photographs
5. Improve readability of text in scanned documents

**Tags:** image, contrast, enhance

- **image**: The image to adjust the brightness for. (`ImageRef`)
- **factor**: Factor to adjust the contrast. 1.0 means no change. (`float`)

## Detail

The DetailNode is an image detail filter.

This node is primarily designed to enhance the details of an image in an AI workflow by applying a detail filter. It is especially useful when you want to emphasize or highlight certain features of the image.

#### Applications
- Enhancing the details of an image to improve its clarity.
- Highlighting certain features of an image for a deeper analysis.

**Tags:** image, enhance

- **image**: The image to detail. (`ImageRef`)

## EdgeEnhance

Enhances edge visibility in images by increasing edge contrast.

Use cases:
1. Improve object boundaries for computer vision tasks
2. Enhance details in medical or scientific imaging
3. Create artistic effects in digital photography
4. Prepare images for feature extraction in image analysis
5. Highlight structural elements in architectural or engineering drawings

**Tags:** image, edge, enhance

- **image**: The image to edge enhance. (`ImageRef`)

## Equalize

Enhances image contrast by equalizing intensity distribution.

Use cases:
1. Improve visibility in poorly lit images
2. Enhance details for image analysis tasks
3. Normalize image data for machine learning
4. Correct uneven lighting in photographs
5. Prepare images for feature extraction

**Tags:** image, contrast, histogram

- **image**: The image to equalize. (`ImageRef`)

## RankFilter

The Rank Filter Node is used to apply a rank filter to a given image.

The purpose of this node is to perform a specific type of image processing technique, known as a rank filter. A rank filter considers the surrounding pixels of each pixel in the image and sorts them according to brightness. The 'rank' refers to the position of the pixel that will replace the current pixel - for example, a rank of 1 would replace each pixel with the darkest surrounding pixel, while a rank of 3 would replace it with the third darkest and so on. The 'size' indicates the total number of surrounding pixels to be considered for this process.

#### Applications
- Image enhancement: This node can be used to enhance the quality of an image, making subtle details more pronounced.
- Noise reduction: The Rank Filter Node can help reduce 'noise' in images, i.e., unwanted or irrelevant details.

**Tags:** image, enhance

- **image**: The image to rank filter. (`ImageRef`)
- **size**: Rank filter size. (`int`)
- **rank**: Rank filter rank. (`int`)

## Sharpen

Enhances image detail by intensifying contrast between adjacent pixels.

Use cases:
1. Improve clarity of photographs for print or digital display
2. Enhance details in medical imaging for diagnosis
3. Sharpen blurry images for better object detection
4. Refine texture details in product photography
5. Increase readability of text in scanned documents

**Tags:** image, sharpen, clarity

- **image**: The image to sharpen. (`ImageRef`)

## Sharpness

Adjusts image sharpness to enhance or reduce detail clarity.

Use cases:
1. Enhance photo details for improved visual appeal
2. Refine images for object detection tasks
3. Correct slightly blurred images
4. Prepare images for print or digital display
5. Adjust sharpness for artistic effect in digital art

**Tags:** image, clarity, sharpness

- **image**: The image to adjust the brightness for. (`ImageRef`)
- **factor**: Factor to adjust the contrast. 1.0 means no change. (`float`)

## UnsharpMask

The Unsharp Mask Node is responsible for performing the unsharp mask filter on an image.

An unsharp mask is a photographic sharpening technique. This node helps to enhance the sharpness of your image by adjusting the radius, the impact and the threshold of the unsharp mask filter.

#### Applications
- Photo editing: Sharpens images by emphasizing transitions, such as those defining edges of objects in the image.
- Digital art creation: Refining and adding crispness to digital artwork.

**Tags:** image, sharpening, enhance

- **image**: The image to unsharp mask. (`ImageRef`)
- **radius**: Unsharp mask radius. (`int`)
- **percent**: Unsharp mask percent. (`int`)
- **threshold**: Unsharp mask threshold. (`int`)

#### `adaptive_contrast`

**Parameters:**

- `image` (Image)
- `clip_limit` (float)
- `grid_size` (int)

**Returns:** `Image`

#### `canny_edge_detection`

**Parameters:**

- `image` (Image)
- `low_threshold` (int)
- `high_threshold` (int)

**Returns:** `Image`

#### `sharpen_image`

**Parameters:**

- `image` (Image)

**Returns:** `Image`

