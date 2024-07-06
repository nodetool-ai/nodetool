# nodetool.nodes.replicate.image.face

## BecomeImage

Adapt any picture of a face into another image

- **seed**: Fix the random seed for reproducibility (`int | None`)
- **image**: An image of a person to be converted (`ImageRef`)
- **prompt** (`str`)
- **image_to_become**: Any image to convert the person to (`ImageRef`)
- **negative_prompt**: Things you do not want in the image (`str`)
- **prompt_strength**: Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original. (`float`)
- **number_of_images**: Number of images to generate (`int`)
- **denoising_strength**: How much of the original image of the person to keep. 1 is the complete destruction of the original image, 0 is the original image (`float`)
- **instant_id_strength**: How strong the InstantID will be. (`float`)
- **image_to_become_noise**: How much noise to add to the style image before processing. An alternative way of controlling stength. (`float`)
- **control_depth_strength**: Strength of depth controlnet. The bigger this is, the more controlnet affects the output. (`float`)
- **disable_safety_checker**: Disable safety checker for generated images (`bool`)
- **image_to_become_strength**: How strong the style will be applied (`float`)

## FaceToMany

Turn a face into 3D, emoji, pixel art, video game, claymation or toy

- **seed**: Fix the random seed for reproducibility (`int | None`)
- **image**: An image of a person to be converted (`ImageRef`)
- **style**: Style to convert to (`Style`)
- **prompt** (`str`)
- **lora_scale**: How strong the LoRA will be (`float`)
- **custom_lora_url**: URL to a Replicate custom LoRA. Must be in the format https://replicate.delivery/pbxt/[id]/trained_model.tar or https://pbxt.replicate.delivery/[id]/trained_model.tar (`str | None`)
- **negative_prompt**: Things you do not want in the image (`str`)
- **prompt_strength**: Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original. (`float`)
- **denoising_strength**: How much of the original image to keep. 1 is the complete destruction of the original image, 0 is the original image (`float`)
- **instant_id_strength**: How strong the InstantID will be. (`float`)
- **control_depth_strength**: Strength of depth controlnet. The bigger this is, the more controlnet affects the output. (`float`)

## FaceToSticker

Turn a face into a sticker

- **seed**: Fix the random seed for reproducibility (`int | None`)
- **image**: An image of a person to be converted to a sticker (`ImageRef`)
- **steps** (`int`)
- **width** (`int`)
- **height** (`int`)
- **prompt** (`str`)
- **upscale**: 2x upscale the sticker (`bool`)
- **upscale_steps**: Number of steps to upscale (`int`)
- **negative_prompt**: Things you do not want in the image (`str`)
- **prompt_strength**: Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original. (`float`)
- **ip_adapter_noise**: How much noise is added to the IP adapter input (`float`)
- **ip_adapter_weight**: How much the IP adapter will influence the image (`float`)
- **instant_id_strength**: How strong the InstantID will be. (`float`)

## InstantId

Make realistic images of real people instantly

- **seed**: Random seed. Leave blank to randomize the seed (`int | None`)
- **image**: Input face image (`ImageRef`)
- **prompt**: Input prompt (`str`)
- **scheduler**: Scheduler (`Scheduler`)
- **enable_lcm**: Enable Fast Inference with LCM (Latent Consistency Models) - speeds up inference steps, trade-off is the quality of the generated image. Performs better with close-up portrait face images (`bool`)
- **pose_image**: (Optional) reference pose image (`ImageRef`)
- **num_outputs**: Number of images to output (`int`)
- **sdxl_weights**: Pick which base weights you want to use (`Sdxl_weights`)
- **output_format**: Format of the output images (`Output_format`)
- **pose_strength**: Openpose ControlNet strength, effective only if `enable_pose_controlnet` is true (`float`)
- **canny_strength**: Canny ControlNet strength, effective only if `enable_canny_controlnet` is true (`float`)
- **depth_strength**: Depth ControlNet strength, effective only if `enable_depth_controlnet` is true (`float`)
- **guidance_scale**: Scale for classifier-free guidance (`float`)
- **output_quality**: Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. (`int`)
- **negative_prompt**: Input Negative Prompt (`str`)
- **ip_adapter_scale**: Scale for image adapter strength (for detail) (`float`)
- **lcm_guidance_scale**: Only used when `enable_lcm` is set to True, Scale for classifier-free guidance when using LCM (`float`)
- **num_inference_steps**: Number of denoising steps (`int`)
- **disable_safety_checker**: Disable safety checker for generated images (`bool`)
- **enable_pose_controlnet**: Enable Openpose ControlNet, overrides strength if set to false (`bool`)
- **enhance_nonface_region**: Enhance non-face region (`bool`)
- **enable_canny_controlnet**: Enable Canny ControlNet, overrides strength if set to false (`bool`)
- **enable_depth_controlnet**: Enable Depth ControlNet, overrides strength if set to false (`bool`)
- **lcm_num_inference_steps**: Only used when `enable_lcm` is set to True, Number of denoising steps when using LCM (`int`)
- **face_detection_input_width**: Width of the input image for face detection (`int`)
- **face_detection_input_height**: Height of the input image for face detection (`int`)
- **controlnet_conditioning_scale**: Scale for IdentityNet strength (for fidelity) (`float`)

## PhotoMaker

Create photos, paintings and avatars for anyone in any style within seconds.

- **seed**: Seed. Leave blank to use a random number (`int | None`)
- **prompt**: Prompt. Example: 'a photo of a man/woman img'. The phrase 'img' is the trigger word. (`str`)
- **num_steps**: Number of sample steps (`int`)
- **style_name**: Style template. The style template will add a style-specific prompt and negative prompt to the user's prompt. (`Style_name`)
- **input_image**: The input image, for example a photo of your face. (`str | None`)
- **num_outputs**: Number of output images (`int`)
- **input_image2**: Additional input image (optional) (`str | None`)
- **input_image3**: Additional input image (optional) (`str | None`)
- **input_image4**: Additional input image (optional) (`str | None`)
- **guidance_scale**: Guidance scale. A guidance scale of 1 corresponds to doing no classifier free guidance. (`float`)
- **negative_prompt**: Negative Prompt. The negative prompt should NOT contain the trigger word. (`str`)
- **style_strength_ratio**: Style strength (%) (`float`)
- **disable_safety_checker**: Disable safety checker for generated images. (`bool`)

## PhotoMakerStyle

Create photos, paintings and avatars for anyone in any style within seconds.  (Stylization version)

- **seed**: Seed. Leave blank to use a random number (`int | None`)
- **prompt**: Prompt. Example: 'a photo of a man/woman img'. The phrase 'img' is the trigger word. (`str`)
- **num_steps**: Number of sample steps (`int`)
- **style_name**: Style template. The style template will add a style-specific prompt and negative prompt to the user's prompt. (`Style_name`)
- **input_image**: The input image, for example a photo of your face. (`ImageRef`)
- **num_outputs**: Number of output images (`int`)
- **input_image2**: Additional input image (optional) (`ImageRef`)
- **input_image3**: Additional input image (optional) (`ImageRef`)
- **input_image4**: Additional input image (optional) (`ImageRef`)
- **guidance_scale**: Guidance scale. A guidance scale of 1 corresponds to doing no classifier free guidance. (`float`)
- **negative_prompt**: Negative Prompt. The negative prompt should NOT contain the trigger word. (`str`)
- **style_strength_ratio**: Style strength (%) (`float`)
- **disable_safety_checker**: Disable safety checker for generated images. (`bool`)

