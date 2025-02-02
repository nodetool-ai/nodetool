# nodetool.nodes.lib.image.pillow.filter

## Blur

Apply a Gaussian blur effect to an image.

- Soften images or reduce noise and detail
- Make focal areas stand out by blurring surroundings
- Protect privacy by blurring sensitive information

**Tags:** image, filter, blur

**Fields:**
- **image**: The image to blur. (ImageRef)
- **radius**: Blur radius. (int)


## Canny

Apply Canny edge detection to an image.

- Highlight areas of rapid intensity change
- Outline object boundaries and structure
- Enhance inputs for object detection and image segmentation

**Tags:** image, filter, edges

**Fields:**
- **image**: The image to canny. (ImageRef)
- **low_threshold**: Low threshold. (int)
- **high_threshold**: High threshold. (int)


## Contour

Apply a contour filter to highlight image edges.

- Extract key features from complex images
- Aid pattern recognition and object detection
- Create stylized contour sketch art effects

**Tags:** image, filter, contour

**Fields:**
- **image**: The image to contour. (ImageRef)


## ConvertToGrayscale

Convert an image to grayscale.

- Simplify images for feature and edge detection
- Prepare images for shape-based machine learning
- Create vintage or monochrome aesthetic effects

**Tags:** image, grayscale

**Fields:**
- **image**: The image to convert. (ImageRef)


## Emboss

Apply an emboss filter for a 3D raised effect.

- Add texture and depth to photos
- Create visually interesting graphics
- Incorporate unique effects in digital artwork

**Tags:** image, filter, emboss

**Fields:**
- **image**: The image to emboss. (ImageRef)


## Expand

Add a border around an image to increase its size.

- Make images stand out by adding a colored border
- Create framed photo effects
- Separate image content from surroundings

**Tags:** image, border, expand

**Fields:**
- **image**: The image to expand. (ImageRef)
- **border**: Border size. (int)
- **fill**: Fill color. (int)


## FindEdges

Detect and highlight edges in an image.

- Analyze structural patterns in images
- Aid object detection in computer vision
- Detect important features like corners and ridges

**Tags:** image, filter, edges

**Fields:**
- **image**: The image to find edges. (ImageRef)


## GetChannel

Extract a specific color channel from an image.

- Isolate color information for image analysis
- Manipulate specific color components in graphic design
- Enhance or reduce visibility of certain colors

**Tags:** image, color, channel, isolate, extract

**Fields:**
- **image**: The image to get the channel from. (ImageRef)
- **channel** (ChannelEnum)


## Invert

Invert the colors of an image.

- Create negative versions of images for visual effects
- Analyze image data by bringing out hidden details
- Preprocess images for operations that work better on inverted colors

**Tags:** image, filter, invert

**Fields:**
- **image**: The image to adjust the brightness for. (ImageRef)


## Posterize

Reduce the number of colors in an image for a poster-like effect.

- Create graphic art by simplifying image colors
- Apply artistic effects to photographs
- Generate visually compelling content for advertising

**Tags:** image, filter, posterize

**Fields:**
- **image**: The image to posterize. (ImageRef)
- **bits**: Number of bits to posterize to. (int)


## Smooth

Apply smoothing to reduce image noise and detail.

- Enhance visual aesthetics of images
- Improve object detection by reducing irrelevant details
- Aid facial recognition by simplifying images

**Tags:** image, filter, smooth

**Fields:**
- **image**: The image to smooth. (ImageRef)


## Solarize

Apply a solarize effect to partially invert image tones.

- Create surreal artistic photo effects
- Enhance visual data by making certain elements more prominent
- Add a unique style to images for graphic design

**Tags:** image, filter, solarize

**Fields:**
- **image**: The image to solarize. (ImageRef)
- **threshold**: Threshold for solarization. (int)


