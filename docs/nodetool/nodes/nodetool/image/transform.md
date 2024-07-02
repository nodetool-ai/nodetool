# nodetool.nodes.nodetool.image.transform

## Blur

The Blur Node is used to apply a blur effect to an image.
The purpose of this node is to allow users to modify an image by adding a blur effect, allowing the degree of blur to be precisely controlled. By customizing the blur radius, users can adjust the intensity of the blur effect.

#### Applications
- Image editing: Soften an image or reduce image noise and detail.
- Focus manipulation: Make certain areas of an image stand out by blurring the surrounding areas.
- Privacy protection: Blur sensitive information in an image.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to blur. (`ImageRef`)
- **radius**: Blur radius. (`float`)

## Canny

The Canny Node applies the Canny filter to an image.
The Canny filter, named after its developer John F. Canny, is primarily used for edge detection in an image. Edge detection is the process of identifying points in an image where sharp color changes occur, which often correspond to object boundaries. The Canny filter is recognised for its superior edge detection due to its use of a multi-stage algorithm.

#### Applications
- Detect the edges in photos and pictures to visually highlight areas with rapid intensity changes.
- Improve image understanding by outlining the boundaries and structure of the objects in the image.
- Enhance machine learning models for tasks like object detection, image recognition and segmentation.

#### Example
To build a workflow, one might connect a 'Load Image' node to the Canny Node. The image to be processed will be loaded from the 'Load Image' node and then passed on to the Canny Node. Once the Canny filter is applied, the resulting image with the highlighted edges can be displayed using a 'Show Image' node.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to canny. (`ImageRef`)
- **low_threshold**: Low threshold. (`int`)
- **high_threshold**: High threshold. (`int`)

## Contour

This node is essentially an image contour filter.
The Contour Node manipulates an input image by applying a contour filter. This node is designed to highlight the edges in an image, thus producing an outline or contour sketch of the image. It's particularly handy when one needs to identify the broad features of a complex image.

#### Applications
- Image Processing: It can be used to extract and highlight the necessary features from an image and avoid unnecessary details.
- Pattern Recognition: It can be used to identify shapes or patterns in images, aiding in computer vision tasks such as object recognition or tracking.
- Artistic Effects: It can be used to convert standard images to stylized versions, mimicking contour sketch arts.

#### Example
In a machine vision workflow, use this node to convert input images into their contour sketches. Then these sketches can be connected to other nodes, for instance, a node detecting specific shapes on those images.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to contour. (`ImageRef`)

## ConvertToGrayscale

This node converts an image to grayscale.
The Convert to Grayscale Node is used to transform a colored image into shades of grey. The purpose of this node is to simplify the image contents, highlighting the contrasts and shapes in the image, instead of colors.

#### Applications
- **Image processing**: Altering the color of an image into grayscale often helps in different image processing tasks like feature detection and edge detection.
- **Machine learning**: Grayscale images simplify machine learning tasks by focusing on shape recognition rather than color.
- **Design and Art**: Grayscale conversion is often used in design and art to give a vintage or monochrome aesthetic to images.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to convert. (`ImageRef`)

## Crop

The Crop Node is used to trim an image.
This node is specifically designed to crop or cut out a section of an image based on specified coordinates. You can indicate the left, top, right, and bottom boundaries for the crop. This becomes useful when you need to focus on a specific area of an image or remove unwanted sections.

#### Applications
- Cropping out unwanted image borders.
- Focus on a particular subject within an image.
- Remove distractions from an image to simplify it.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to crop. (`ImageRef`)
- **left**: The left coordinate. (`int`)
- **top**: The top coordinate. (`int`)
- **right**: The right coordinate. (`int`)
- **bottom**: The bottom coordinate. (`int`)

## Emboss

The Emboss Node applies an embossing effect to an image.
The purpose of this node is to transform any given image by applying an emboss filter which achieves a three-dimensional look, as if the image objects are raised above the background. Embossing adds texture and depth to the image making it more visually stimulating.

#### Applications
- Photo Editing: Use this node to apply artistic effects on photos.
- Graphic Design: Apply emboss filter to create visually interesting graphics.
- Digital Art: Incorporate in digital artwork for a unique textured effect.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to emboss. (`ImageRef`)

## Expand

This node expands images, by adding a border around them.
This Expand Node is used to increase the size of an image by adding a specific border size and color. This helps users to differentiate the main content of an image from its surroundings.

#### Applications
- Separating images from surrounding content: You can add a colored border around an image to make it stand out from its environment.
- Image framing: The bordered image can serve as a framed photo, making it more appealing.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to expand. (`ImageRef`)
- **border**: Border size. (`int`)
- **fill**: Fill color. (`int`)

## FindEdges

This node is a "Find Edges" filter. It identifies edges within an image.
The purpose of this node is to highlight areas in an image where significant changes in color or intensity occur, which are often perceived as edges or boundaries. Using this, you can have a clearer understanding of the structural patterns in your image.

#### Applications
- **Image Analysis:** Can be used to analyze and interpret the structures within an image.
- **Computer Vision:** Helpful in object detection and recognition tasks, where edge information is crucial.
- **Feature Detection:** Used to detect important image features such as corners, ridges, or blobs.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to find edges. (`ImageRef`)

## Fit

The FitNode is a workflow component that resizes an image to fit within a specified size.
The FitNode is a vital tool in image processing workflows. It takes as input an image and a desired size (width and height) and adjusts the dimensions of the image while maintaining its aspect ratio. This tool ensures that your images fit perfectly into predefined spaces, keeping the integrity and quality of the image content intact.

#### Applications
- Image resizing for online publishing: FitNode ensures your images meet the dimension requirements of different platforms.
- Preprocessing for machine learning: Uniform image sizes can aid in the efficiency and accuracy of your algorithms.
- Web development: Use FitNode to control and adjust image display sizes on your website.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to fit. (`ImageRef`)
- **width**: Width to fit to. (`int`)
- **height**: Height to fit to. (`int`)

## GetChannel

This node is useful for extracting a specific color channel from an image.
The Get Channel Node is purposed for fetching a particular color channel ('red', 'green', or 'blue') from an input image. This node enables isolating the user-specified colour information, which is significant in different image processing scenarios such as enhancing image visibility, filtering colors, and improving image analyses.

#### Applications
- **Image Analysis**: Extracting color channels can be useful in scenarios where particular color information is needed for image analysis.
- **Graphic Design**: Graphic designers can use this node to isolate and manipulate specific color components in an image.
- **Image Enhancements**: By isolating a certain color channel, one can enhance or decrease the visibility of certain color components in an image.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to get the channel from. (`ImageRef`)
- **channel** (`ChannelEnum`)

## Invert

The Invert Node is a filter node that inverts the colors of an image.
This node is specifically designed to perform a color inversion operation on an image. In simple terms, it changes every color in the image to its exact opposite color on the color wheel, creating a kind of 'negative' of the original image. It's a commonly used filter in image editing and can give unique and interesting results.

#### Applications
- Creating 'negative' versions of images for visual effect or artistic purposes.
- Analyzing image data by bringing out details that might be overlooked in the original image.
- Preprocessing images for further operations that work better on inverted images.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to adjust the brightness for. (`ImageRef`)

## Posterize

The Posterize Node is used for applying a "posterization" effect to an image.
In short, it simplifies an image's colors by reducing the number of bits per color channel, resulting in a "poster-like" appearance, often used in graphic art and illustration. It could bring a unique, artistic style to your images and emphasize certain elements within the image.

#### Applications
- Graphic Design: Create graphic art by posterizing an image and adding additional design elements.
- Photography: Apply artistic effects to photographs to emphasize certain aspects or to change the image's mood.
- Advertising: Create compelling visual content for advertisement and promotional campaigns by posterizing images.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to posterize. (`ImageRef`)
- **bits**: Number of bits to posterize to. (`int`)

## Resize

The Resize Node is a tool that modifies the size of an image.
The purpose of this node is to change the width and height of an image to desired dimensions. The notable feature of this node is the use of the high-quality PIL.Image.LANCZOS filter for resizing, which helps in maintaining the quality of the image.

#### Applications
- Preprocessing images for machine learning models: Changing the size of images to fit the input size requirement of the model.
- Image optimization for the web: Reducing the size of an image to improve the load time of a webpage.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to resize. (`ImageRef`)
- **width**: The target width. (`int`)
- **height**: The target height. (`int`)

## Scale

The Scale Node let's you enlarge or shrink an image.
This node adjusts an image to a size that is a given factor times larger or smaller than the original. Useful when preparing images for display or analysis, it ensures a suitable size while maintaining the original aspect ratio.

#### Applications
- Image processing: Use this node to adjust the dimensions of images in a photo gallery.
- Data preprocessing: In machine learning, this node can standardize images to a consistent size before feeding them to an algorithm.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to scale. (`ImageRef`)
- **scale**: The scale factor. (`float`)

## Smooth

Smooth Node is a computational function designed to smooth images.
The node takes an image as input, applies a smooth filter, and returns the smoothed image as the output. The smoothing process aids in reducing image noise and detail, providing a visually pleasing image. It's a vital step in many image processing tasks such as object detection, facial recognition, and feature extraction.

#### Applications
- Image Editing: You can use Smooth Node to smoothen your images for a better visual aesthetics.
- Object Detection: It can help diminish irrelevant image details, thus improving object detection process.
- Facial Recognition: The smooth filter can reduce the complexity of the image, making facial recognition more accurate.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to smooth. (`ImageRef`)

## Solarize

The Solarize Node is a filter node that applies a special solarize effect to an image.
This solarization effect involves reversing the tones of an image, either wholly or partially. It is an artistic technique widely used in photography, which creates a distinctive and eye-catching visual style. The Solarize Node lets you define a threshold, this threshold determines which tones in the image to reverse.

#### Applications
- Creating artistic photo effects: Solarization can produce surreal and abstract images from ordinary photographs.
- Enhancing visual data: Solarization can be used to make certain elements within an image more prominent.

**Tags:** 

**Inherits from:** BaseNode

- **image**: The image to solarize. (`ImageRef`)
- **threshold**: Threshold for solarization. (`int`)

