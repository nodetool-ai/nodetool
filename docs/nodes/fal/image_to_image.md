# nodetool.nodes.fal.image_to_image

## BriaBackgroundRemove

Bria RMBG 2.0 enables seamless removal of backgrounds from images, ideal for professional editing tasks.

**Tags:** Trained exclusively on licensed data for safe and risk-free commercial use.

**Fields:**
- **image**: Input image to remove background from (ImageRef)


## BriaBackgroundReplace

Bria Background Replace allows for efficient swapping of backgrounds in images via text prompts or reference image, delivering realistic and polished results. Trained exclusively on licensed data for safe and risk-free commercial use.

Use cases:
- Replace image backgrounds seamlessly
- Create professional photo compositions
- Generate custom scene settings
- Produce commercial-ready images
- Create consistent visual environments

**Tags:** image, background, replacement, swap

**Fields:**
- **image**: Input image to replace background (ImageRef)
- **ref_image**: Reference image for the new background (ImageRef)
- **prompt**: Prompt to generate new background (str)
- **negative_prompt**: Negative prompt for background generation (str)
- **refine_prompt**: Whether to refine the prompt (bool)
- **seed**: The same seed will output the same image every time (int)


## BriaEraser

Bria Eraser enables precise removal of unwanted objects from images while maintaining high-quality outputs. Trained exclusively on licensed data for safe and risk-free commercial use.

Use cases:
- Remove unwanted objects from images
- Clean up image imperfections
- Prepare images for commercial use
- Remove distracting elements
- Create clean, professional images

**Tags:** image, removal, cleanup

**Fields:**
- **image**: Input image to erase from (ImageRef)
- **mask**: The mask for areas to be cleaned (ImageRef)
- **mask_type**: Type of mask - 'manual' for user-created or 'automatic' for algorithm-generated (str)


## BriaExpand

Bria Expand expands images beyond their borders in high quality. Trained exclusively on licensed data for safe and risk-free commercial use.

Use cases:
- Extend image boundaries seamlessly
- Create wider or taller compositions
- Expand images for different aspect ratios
- Generate additional scene content

**Tags:** image, expansion, outpainting

**Fields:**
- **image**: The input image to expand (ImageRef)
- **canvas_width**: The desired width of the final image, after the expansion (int)
- **canvas_height**: The desired height of the final image, after the expansion (int)
- **original_image_width**: The desired width of the original image, inside the full canvas (int)
- **original_image_height**: The desired height of the original image, inside the full canvas (int)
- **original_image_x**: The desired x-coordinate of the original image, inside the full canvas (int)
- **original_image_y**: The desired y-coordinate of the original image, inside the full canvas (int)
- **prompt**: Text on which you wish to base the image expansion (str)
- **negative_prompt**: The negative prompt to use when generating images (str)
- **num_images**: Number of images to generate (int)
- **seed**: The same seed will output the same image every time (int)


## BriaGenFill

Bria GenFill enables high-quality object addition or visual transformation. Trained exclusively on licensed data for safe and risk-free commercial use.

Use cases:
- Add new objects to existing images
- Transform specific image areas
- Generate contextual content
- Create seamless visual additions
- Produce professional image modifications

**Tags:** image, generation, filling, transformation

**Fields:**
- **image**: Input image to erase from (ImageRef)
- **mask**: The mask for areas to be cleaned (ImageRef)
- **prompt**: The prompt to generate images (str)
- **negative_prompt**: The negative prompt to use when generating images (str)
- **seed**: The same seed will output the same image every time (int)


## BriaProductShot

Place any product in any scenery with just a prompt or reference image while maintaining high integrity of the product. Trained exclusively on licensed data for safe and risk-free commercial use and optimized for eCommerce.

Use cases:
- Create professional product photography
- Generate contextual product shots
- Place products in custom environments
- Create eCommerce product listings
- Generate marketing visuals

**Tags:** image, product, placement, ecommerce

**Fields:**
- **image**: The product image to be placed (ImageRef)
- **scene_description**: Text description of the new scene/background (str)
- **ref_image**: Reference image for the new scene/background (ImageRef)
- **optimize_description**: Whether to optimize the scene description (bool)
- **placement_type**: How to position the product (original, automatic, manual_placement, manual_padding) (str)
- **manual_placement_selection**: Specific placement position when using manual_placement (str)


## FluxDevRedux

FLUX.1 [dev] Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications.

Use cases:
- Transform images with advanced controls
- Create customized image variations
- Apply precise style modifications

**Tags:** image, transformation, style-transfer, development, flux

**Fields:**
- **image**: The input image to transform (ImageRef)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **seed**: The same seed will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## FluxLoraCanny

FLUX LoRA Canny enables precise control over composition and style through edge detection and LoRA-based guidance mechanisms.

Use cases:
- Generate stylized images with structural control
- Create edge-guided artistic transformations
- Apply custom styles while maintaining composition
- Produce consistent style variations

**Tags:** image, edge, lora, style-transfer, control

**Fields:**
- **control_image**: The control image to generate the Canny edge map from (ImageRef)
- **prompt**: The prompt to generate an image from (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **seed**: The same seed will output the same image every time (int)
- **lora_scale**: The strength of the LoRA adaptation (float)


## FluxLoraDepth

FLUX LoRA Depth enables precise control over composition and structure through depth map detection and LoRA-based guidance mechanisms.

Use cases:
- Generate depth-aware stylized images
- Create 3D-conscious artistic transformations
- Maintain spatial relationships with custom styles
- Produce depth-consistent variations
- Generate images with controlled perspective

**Tags:** image, depth, lora, structure, control

**Fields:**
- **control_image**: The control image to generate the depth map from (ImageRef)
- **prompt**: The prompt to generate an image from (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **seed**: The same seed will output the same image every time (int)
- **lora_scale**: The strength of the LoRA adaptation (float)


## FluxProCanny

FLUX.1 [pro] Canny enables precise control over composition, style, and structure through advanced edge detection and guidance mechanisms.

Use cases:
- Generate images with precise structural control
- Create artwork based on edge maps
- Transform sketches into detailed images
- Maintain specific compositional elements
- Generate variations with consistent structure

**Tags:** image, edge, composition, style, control

**Fields:**
- **control_image**: The control image to generate the Canny edge map from (ImageRef)
- **prompt**: The prompt to generate an image from (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **seed**: The same seed will output the same image every time (int)
- **safety_tolerance**: Safety tolerance level (1-6, 1 being most strict) (str)


## FluxProDepth

FLUX.1 [pro] Depth enables precise control over composition and structure through depth map detection and guidance mechanisms.

Use cases:
- Generate images with controlled depth perception
- Create 3D-aware image transformations
- Maintain spatial relationships in generated images
- Produce images with accurate perspective
- Generate variations with consistent depth structure

**Tags:** image, depth-map, composition, structure, control

**Fields:**
- **control_image**: The control image to generate the depth map from (ImageRef)
- **prompt**: The prompt to generate an image from (str)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **seed**: The same seed will output the same image every time (int)
- **safety_tolerance**: Safety tolerance level (1-6, 1 being most strict) (str)


## FluxProFill

FLUX.1 [pro] Fill is a high-performance endpoint that enables rapid transformation of existing images with inpainting/outpainting capabilities.

Use cases:
- Fill in missing or masked parts of images
- Extend images beyond their original boundaries
- Remove and replace unwanted elements
- Create seamless image completions
- Generate context-aware image content

**Tags:** image, inpainting, outpainting, transformation, professional

**Fields:**
- **image**: The input image to transform (ImageRef)
- **mask**: The mask for inpainting (ImageRef)
- **prompt**: The prompt to fill the masked part of the image (str)
- **num_inference_steps**: The number of inference steps to perform (int)
- **seed**: The same seed will output the same image every time (int)
- **safety_tolerance**: Safety tolerance level (1-6, 1 being most strict) (str)


## FluxProRedux

FLUX.1 [pro] Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications.

Use cases:
- Create professional image transformations
- Generate style transfers

**Tags:** image, transformation, style-transfer, flux

**Fields:**
- **image**: The input image to transform (ImageRef)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **seed**: The same seed will output the same image every time (int)
- **safety_tolerance**: Safety tolerance level (1-6, 1 being most strict) (str)


## FluxProUltraRedux

FLUX1.1 [pro] ultra Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.

Use cases:
- Apply precise image modifications
- Process images with maximum control

**Tags:** image, transformation, style-transfer, ultra, professional

**Fields:**
- **image**: The input image to transform (ImageRef)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **guidance_scale**: How closely the model should stick to your prompt (float)
- **seed**: The same seed will output the same image every time (int)
- **safety_tolerance**: Safety tolerance level (1-6, 1 being most strict) (str)
- **image_prompt_strength**: The strength of the image prompt, between 0 and 1 (float)


## FluxSchnellRedux

FLUX.1 [schnell] Redux is a high-performance endpoint that enables rapid transformation of existing images, delivering high-quality style transfers and image modifications with the core FLUX capabilities.

Use cases:
- Transform images with style transfers
- Apply artistic modifications to photos
- Create image variations

**Tags:** image, transformation, style-transfer, fast, flux

**Fields:**
- **image**: The input image to transform (ImageRef)
- **image_size**: The size of the generated image (ImageSizePreset)
- **num_inference_steps**: The number of inference steps to perform (int)
- **seed**: The same seed will output the same image every time (int)
- **enable_safety_checker**: If true, the safety checker will be enabled (bool)


## IdeogramV2Edit

Transform existing images with Ideogram V2's editing capabilities. Modify, adjust, and refine images while maintaining high fidelity and realistic outputs with precise prompt control.

Use cases:
- Edit specific parts of images with precision
- Create targeted image modifications
- Refine and enhance image details
- Generate contextual image edits

**Tags:** image, editing, transformation, fidelity, control

**Fields:**
- **prompt**: The prompt to fill the masked part of the image (str)
- **image**: The image to edit (ImageRef)
- **mask**: The mask for editing (ImageRef)
- **style**: Style of generated image (auto, general, realistic, design, render_3D, anime) (str)
- **expand_prompt**: Whether to expand the prompt with MagicPrompt functionality (bool)
- **seed**: The same seed will output the same image every time (int)


## IdeogramV2Remix

Reimagine existing images with Ideogram V2's remix feature. Create variations and adaptations while preserving core elements and adding new creative directions through prompt guidance.

Use cases:
- Create artistic variations of images
- Generate style-transferred versions
- Produce creative image adaptations
- Transform images while preserving key elements
- Generate alternative interpretations

**Tags:** image, remix, variation, creativity, adaptation

**Fields:**
- **prompt**: The prompt to remix the image with (str)
- **image**: The image to remix (ImageRef)
- **aspect_ratio**: The aspect ratio of the generated image (str)
- **strength**: Strength of the input image in the remix (float)
- **expand_prompt**: Whether to expand the prompt with MagicPrompt functionality (bool)
- **style**: Style of generated image (auto, general, realistic, design, render_3D, anime) (str)
- **seed**: The same seed will output the same image every time (int)


