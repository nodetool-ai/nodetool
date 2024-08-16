# nodetool.nodes.nodetool.image.transform

## Blur

Apply a Gaussian blur effect to an image.

- Soften images or reduce noise and detail
- Make focal areas stand out by blurring surroundings
- Protect privacy by blurring sensitive information

**Fields:**
image: ImageRef
radius: int

## Canny

Apply Canny edge detection to an image.

- Highlight areas of rapid intensity change
- Outline object boundaries and structure
- Enhance inputs for object detection and image segmentation

**Fields:**
image: ImageRef
low_threshold: int
high_threshold: int

## Contour

Apply a contour filter to highlight image edges.

- Extract key features from complex images
- Aid pattern recognition and object detection
- Create stylized contour sketch art effects

**Fields:**
image: ImageRef

## ConvertToGrayscale

Convert an image to grayscale.

- Simplify images for feature and edge detection
- Prepare images for shape-based machine learning
- Create vintage or monochrome aesthetic effects

**Fields:**
image: ImageRef

## Crop

Crop an image to specified coordinates.

- Remove unwanted borders from images
- Focus on particular subjects within an image
- Simplify images by removing distractions

**Fields:**
image: ImageRef
left: int
top: int
right: int
bottom: int

## Emboss

Apply an emboss filter for a 3D raised effect.

- Add texture and depth to photos
- Create visually interesting graphics
- Incorporate unique effects in digital artwork

**Fields:**
image: ImageRef

## Expand

Add a border around an image to increase its size.

- Make images stand out by adding a colored border
- Create framed photo effects
- Separate image content from surroundings

**Fields:**
image: ImageRef
border: int
fill: int

## FindEdges

Detect and highlight edges in an image.

- Analyze structural patterns in images
- Aid object detection in computer vision
- Detect important features like corners and ridges

**Fields:**
image: ImageRef

## Fit

Resize an image to fit within specified dimensions while preserving aspect ratio.

- Resize images for online publishing requirements
- Preprocess images to uniform sizes for machine learning
- Control image display sizes for web development

**Fields:**
image: ImageRef
width: int
height: int

## GetChannel

Extract a specific color channel from an image.
#image #color

- Isolate color information for image analysis
- Manipulate specific color components in graphic design
- Enhance or reduce visibility of certain colors

**Fields:**
image: ImageRef
channel: ChannelEnum

## Invert

Invert the colors of an image.

- Create negative versions of images for visual effects
- Analyze image data by bringing out hidden details
- Preprocess images for operations that work better on inverted colors

**Fields:**
image: ImageRef

## Posterize

Reduce the number of colors in an image for a poster-like effect.

- Create graphic art by simplifying image colors
- Apply artistic effects to photographs
- Generate visually compelling content for advertising

**Fields:**
image: ImageRef
bits: int

## Resize

Change image dimensions to specified width and height.

- Preprocess images for machine learning model inputs
- Optimize images for faster web page loading
- Create uniform image sizes for layouts

**Fields:**
image: ImageRef
width: int
height: int

## Scale

Enlarge or shrink an image by a scale factor.

- Adjust image dimensions for display galleries
- Standardize image sizes for machine learning datasets
- Create thumbnail versions of images

**Fields:**
image: ImageRef
scale: float

## Smooth

Apply smoothing to reduce image noise and detail.

- Enhance visual aesthetics of images
- Improve object detection by reducing irrelevant details
- Aid facial recognition by simplifying images

**Fields:**
image: ImageRef

## Solarize

Apply a solarize effect to partially invert image tones.

- Create surreal artistic photo effects
- Enhance visual data by making certain elements more prominent
- Add a unique style to images for graphic design

**Fields:**
image: ImageRef
threshold: int

