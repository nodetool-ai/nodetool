# nodetool.nodes.nodetool.image

## BatchToList

Convert an image batch to a list of image references.

Use cases:
- Convert comfy batch outputs to list format

**Tags:** batch, list, images, processing

**Fields:**
- **batch**: The batch of images to convert. (ImageRef)


## Blend

Blend two images with adjustable alpha mixing.

Use cases:
- Create smooth transitions between images
- Adjust opacity of overlays
- Combine multiple exposures or effects

**Tags:** blend, mix, fade, transition

**Fields:**
- **image1**: The first image to blend. (ImageRef)
- **image2**: The second image to blend. (ImageRef)
- **alpha**: The mix ratio. (float)


## Composite

Combine two images using a mask for advanced compositing.
Keywords: composite, mask, blend, layering

Use cases:
- Create complex image compositions
- Apply selective blending or effects
- Implement advanced photo editing techniques

**Tags:** 

**Fields:**
- **image1**: The first image to composite. (ImageRef)
- **image2**: The second image to composite. (ImageRef)
- **mask**: The mask to composite with. (ImageRef)


## ConvertToTensor

Convert PIL Image to normalized tensor representation.

Use cases:
- Prepare images for machine learning models
- Convert between image formats for processing
- Normalize image data for consistent calculations

**Tags:** image, tensor, conversion, normalization

**Fields:**
- **image**: The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels. (ImageRef)


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
- **name** (str)

### result_for_client

**Args:**
- **result (dict)**

**Returns:** dict


- [nodetool.nodes.nodetool.image.enhance](image/enhance.md)
- [nodetool.nodes.nodetool.image.grid](image/grid.md)
- [nodetool.nodes.nodetool.image.source](image/source.md)
- [nodetool.nodes.nodetool.image.transform](image/transform.md)
