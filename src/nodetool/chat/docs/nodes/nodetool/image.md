# nodetool.nodes.nodetool.image

## BatchToList

Convert an image batch to a list of image references.

Use cases:
- Convert comfy batch outputs to list format

**Fields:**
batch: ImageRef

## Blend

Blend two images with adjustable alpha mixing.

Use cases:
- Create smooth transitions between images
- Adjust opacity of overlays
- Combine multiple exposures or effects

**Fields:**
image1: ImageRef
image2: ImageRef
alpha: float

## Composite

Combine two images using a mask for advanced compositing.
Keywords: composite, mask, blend, layering

Use cases:
- Create complex image compositions
- Apply selective blending or effects
- Implement advanced photo editing techniques

**Fields:**
image1: ImageRef
image2: ImageRef
mask: ImageRef

## ConvertToTensor

Convert PIL Image to normalized tensor representation.

Use cases:
- Prepare images for machine learning models
- Convert between image formats for processing
- Normalize image data for consistent calculations

**Fields:**
image: ImageRef

## GetMetadata

Get metadata about the input image.

Use cases:
- Use width and height for layout calculations
- Analyze image properties for processing decisions
- Gather information for image cataloging or organization

**Fields:**
image: ImageRef

## Paste

Paste one image onto another at specified coordinates.

Use cases:
- Add watermarks or logos to images
- Combine multiple image elements
- Create collages or montages

**Fields:**
image: ImageRef
paste: ImageRef
left: int
top: int

## SaveImage

Save an image to specified folder with customizable name format.

Use cases:
- Save generated images with timestamps
- Organize outputs into specific folders
- Create backups of processed images

**Fields:**
image: ImageRef
folder: FolderRef
name: str

- [nodetool.nodes.nodetool.image.enhance](image/enhance.md)
- [nodetool.nodes.nodetool.image.grid](image/grid.md)
- [nodetool.nodes.nodetool.image.source](image/source.md)
- [nodetool.nodes.nodetool.image.transform](image/transform.md)
