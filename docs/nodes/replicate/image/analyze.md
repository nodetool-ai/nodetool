# nodetool.nodes.replicate.image.analyze

## ClipFeatures

Return CLIP features for the clip-vit-large-patch14 model

**Fields:**
- **inputs**: Newline-separated inputs. Can either be strings of text or image URIs starting with http[s]:// (str)


## ClipInterrogator

The CLIP Interrogator is a prompt engineering tool that combines OpenAI's CLIP and Salesforce's BLIP to optimize text prompts to match a given image. Use the resulting prompts with text-to-image models like Stable Diffusion to create cool art!

**Fields:**
- **mode**: Prompt mode (best takes 10-20 seconds, fast takes 1-2 seconds). (Mode)
- **image**: Input image (ImageRef)
- **clip_model_name**: Choose ViT-L for Stable Diffusion 1, ViT-H for Stable Diffusion 2, or ViT-bigG for Stable Diffusion XL. (Clip_model_name)


## GLM_4V_9B

GLM-4V is a multimodal model competitive with GPT-4o and other top models.

**Fields:**
- **image**: Image input (ImageRef)
- **prompt**: Propmt (str | None)


## Img2Prompt

Get an approximate text prompt, with style, matching an image.  (Optimized for stable-diffusion (clip ViT-L/14))

**Fields:**
- **image**: Input image (ImageRef)


## Llava13b

Visual instruction tuning towards large language and vision models with GPT-4 level capabilities

**Fields:**
- **image**: Input image (ImageRef)
- **top_p**: When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens (float)
- **prompt**: Prompt to use for text generation (str | None)
- **max_tokens**: Maximum number of tokens to generate. A word is generally 2-3 tokens (int)
- **temperature**: Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic (float)


## Llava34B

LLaVA v1.6: Large Language and Vision Assistant (Nous-Hermes-2-34B)

**Fields:**
- **image**: Input image (ImageRef)
- **top_p**: When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens (float)
- **prompt**: Prompt to use for text generation (str | None)
- **history**: List of earlier chat messages, alternating roles, starting with user input. Include <image> to specify which message to attach the image to. (list)
- **max_tokens**: Maximum number of tokens to generate. A word is generally 2-3 tokens (int)
- **temperature**: Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic (float)


## MiniGPT4

A model which generates text in response to an input image and prompt.

**Fields:**
- **image**: Image to discuss (ImageRef)
- **top_p**: Sample from the top p percent most likely tokens (float)
- **prompt**: Prompt for mini-gpt4 regarding input image (str | None)
- **num_beams**: Number of beams for beam search decoding (int)
- **max_length**: Total length of prompt and output in tokens (int)
- **temperature**: Temperature for generating tokens, lower = more predictable results (float)
- **max_new_tokens**: Maximum number of new tokens to generate (int)
- **repetition_penalty**: Penalty for repeated words in generated text; 1 is no penalty, values greater than 1 discourage repetition, less than 1 encourage it. (float)


## Moondream2

moondream2 is a small vision language model designed to run efficiently on edge devices

**Fields:**
- **image**: Input image (ImageRef)
- **prompt**: Input prompt (str)


## NSFWImageDetection

Falcons.ai Fine-Tuned Vision Transformer (ViT) for NSFW Image Classification

**Fields:**
- **image**: Input image (str | None)


## SDXLClipInterrogator

CLIP Interrogator for SDXL optimizes text prompts to match a given image

**Fields:**
- **mode**: Prompt Mode: fast takes 1-2 seconds, best takes 15-25 seconds. (Mode)
- **image**: Input image (ImageRef)


