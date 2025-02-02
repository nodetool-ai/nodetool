# nodetool.nodes.lib.image.pillow.draw

## Background

The Background Node creates a blank background.
This node is mainly used for generating a base layer for image processing tasks. It produces a uniform image, having a user-specified width, height and color. The color is given in a hexadecimal format, defaulting to white if not specified.

#### Applications
- As a base layer for creating composite images.
- As a starting point for generating patterns or graphics.
- When blank backgrounds of specific colors are required for visualization tasks.

**Tags:** image, background, blank, base, layer

**Fields:**
- **width** (int)
- **height** (int)
- **color** (ColorRef)


## GaussianNoise

This node creates and adds Gaussian noise to an image.

The Gaussian Noise Node is designed to simulate realistic distortions that can occur in a photographic image. It generates a noise-filled image using the Gaussian (normal) distribution. The noise level can be adjusted using the mean and standard deviation parameters.

#### Applications
- Simulating sensor noise in synthetic data.
- Testing image-processing algorithms' resilience to noise.
- Creating artistic effects in images.

**Tags:** image, noise, gaussian, distortion, artifact

**Fields:**
- **mean** (float)
- **stddev** (float)
- **width** (int)
- **height** (int)


## RenderText

This node allows you to add text to images.
This node takes text, font updates, coordinates (where to place the text), and an image to work with. A user can use the Render Text Node to add a label or title to an image, watermark an image, or place a caption directly on an image.

The Render Text Node offers customizable options, including the ability to choose the text's font, size, color, and alignment (left, center, or right). Text placement can also be defined, providing flexibility to place the text wherever you see fit.

#### Applications
- Labeling images in a image gallery or database.
- Watermarking images for copyright protection.
- Adding custom captions to photographs.
- Creating instructional images to guide the reader's view.

**Tags:** text, font, label, title, watermark, caption, image, overlay

**Fields:**
- **text**: The text to render. (str)
- **font**: The font to use. (TextFont)
- **x**: The x coordinate. (float)
- **y**: The y coordinate. (float)
- **size**: The font size. (int)
- **color**: The font color. (ColorRef)
- **align** (TextAlignment)
- **image**: The image to render on. (ImageRef)


