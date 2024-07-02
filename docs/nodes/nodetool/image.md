# nodetool.nodes.nodetool.image

## Blend

Blend two images together. The `alpha` parameter controls the mix ratio.

**Inherits from:** BaseNode

- **image1**: The first image to blend. (`ImageRef`)
- **image2**: The second image to blend. (`ImageRef`)
- **alpha**: The mix ratio. (`float`)

## Composite

Combine two images into a single output image.

**Inherits from:** BaseNode

- **image1**: The first image to composite. (`ImageRef`)
- **image2**: The second image to composite. (`ImageRef`)
- **mask**: The mask to composite with. (`ImageRef`)

## ImageToTensor

Convert an image to a tensor.

**Inherits from:** BaseNode

- **image**: The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels. (`ImageRef`)

## Paste

Paste an image into another image. The `left` and `top` parameters specify the coordinates of the top-left corner of the pasted image.

**Inherits from:** BaseNode

- **image**: The image to paste into. (`ImageRef`)
- **paste**: The image to paste. (`ImageRef`)
- **left**: The left coordinate. (`int`)
- **top**: The top coordinate. (`int`)

## SaveImage

Save an image to your assets. You can choose a folder or save into the root folder.

**Inherits from:** BaseNode

- **image**: The image to save. (`ImageRef`)
- **folder**: The folder to save the image in. (`FolderRef`)
- **name** (`str`)

## TensorToImage

Convert a tensor to an image.

**Inherits from:** BaseNode

- **tensor**: The input tensor to convert to an image. Should have either 1, 3, or 4 channels. (`Tensor`)

- [nodetool.nodes.nodetool.image.classify](/nodes/nodetool/image/classify.md)
- [nodetool.nodes.nodetool.image.enhance](/nodes/nodetool/image/enhance.md)
- [nodetool.nodes.nodetool.image.source](/nodes/nodetool/image/source.md)
- [nodetool.nodes.nodetool.image.transform](/nodes/nodetool/image/transform.md)
