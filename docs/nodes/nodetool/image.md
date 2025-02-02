# nodetool.nodes.nodetool.image

## BatchToList

Convert an image batch to a list of image references.

Use cases:
- Convert comfy batch outputs to list format

**Tags:** batch, list, images, processing

**Fields:**
- **batch**: The batch of images to convert. (ImageRef)


## Crop

Crop an image to specified coordinates.

- Remove unwanted borders from images
- Focus on particular subjects within an image
- Simplify images by removing distractions

**Tags:** image, crop

**Fields:**
- **image**: The image to crop. (ImageRef)
- **left**: The left coordinate. (int)
- **top**: The top coordinate. (int)
- **right**: The right coordinate. (int)
- **bottom**: The bottom coordinate. (int)


## Fit

Resize an image to fit within specified dimensions while preserving aspect ratio.

- Resize images for online publishing requirements
- Preprocess images to uniform sizes for machine learning
- Control image display sizes for web development

**Tags:** image, resize, fit

**Fields:**
- **image**: The image to fit. (ImageRef)
- **width**: Width to fit to. (int)
- **height**: Height to fit to. (int)


## GetMetadata

Get metadata about the input image.

Use cases:
- Use width and height for layout calculations
- Analyze image properties for processing decisions
- Gather information for image cataloging or organization

**Tags:** metadata, properties, analysis, information

**Fields:**
- **image**: The input image. (ImageRef)


## Paste

Paste one image onto another at specified coordinates.

Use cases:
- Add watermarks or logos to images
- Combine multiple image elements
- Create collages or montages

**Tags:** paste, composite, positioning, overlay

**Fields:**
- **image**: The image to paste into. (ImageRef)
- **paste**: The image to paste. (ImageRef)
- **left**: The left coordinate. (int)
- **top**: The top coordinate. (int)


## Resize

Change image dimensions to specified width and height.

- Preprocess images for machine learning model inputs
- Optimize images for faster web page loading
- Create uniform image sizes for layouts

**Tags:** image, resize

**Fields:**
- **image**: The image to resize. (ImageRef)
- **width**: The target width. (int)
- **height**: The target height. (int)


## SaveImage

Save an image to specified folder with customizable name format.

Use cases:
- Save generated images with timestamps
- Organize outputs into specific folders
- Create backups of processed images

**Tags:** save, image, folder, naming

**Fields:**
- **image**: The image to save. (ImageRef)
- **folder**: The folder to save the image in. (FolderRef)
- **name**: 
        Name of the output file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         (str)

### required_inputs

**Args:**

### result_for_client

**Args:**
- **result (dict[str, typing.Any])**

**Returns:** dict[str, typing.Any]


## Scale

Enlarge or shrink an image by a scale factor.

- Adjust image dimensions for display galleries
- Standardize image sizes for machine learning datasets
- Create thumbnail versions of images

**Tags:** image, resize, scale

**Fields:**
- **image**: The image to scale. (ImageRef)
- **scale**: The scale factor. (float)


