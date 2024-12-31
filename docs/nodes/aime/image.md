# nodetool.nodes.aime.image

## Flux

Generate images using Flux through the Aime API.

Use cases:
- Generate high-quality images from text descriptions
- Create artistic variations of prompts
- Produce realistic or stylized imagery

**Tags:** image generation, ai art, flux

**Fields:**
- **prompt**: The text prompt describing the desired image. (str)
- **image**: An image to use as a starting point for generation. (ImageRef)
- **height**: Height of the generated image. (int)
- **width**: Width of the generated image. (int)
- **seed**: Random seed for generation. Use -1 for random seed. (int)
- **steps**: Number of denoising steps. (int)
- **guidance**: Guidance scale for generation. (float)
- **image2image_strength**: Strength of image-to-image transformation. (float)


## StableDiffusion3

Generate images using Stable Diffusion 3 through the Aime API.

Use cases:
- Generate high-quality images from text descriptions
- Create artistic variations of prompts
- Produce realistic or stylized imagery

**Tags:** image generation, ai art, stable diffusion

**Fields:**
- **prompt**: The text prompt describing the desired image. (str)
- **negative_prompt**: Text prompt describing elements to avoid in the image. (str)
- **image**: An image to use as a starting point for generation. (ImageRef)
- **height**: Height of the generated image. (int)
- **width**: Width of the generated image. (int)
- **seed**: Random seed for generation. Use -1 for random seed. (int)
- **num_samples**: Number of images to generate. (int)
- **steps**: Number of denoising steps. (int)
- **cfg_scale**: Classifier free guidance scale. (float)
- **denoise**: Denoising strength. (float)


