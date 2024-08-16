# nodetool.nodes.replicate.image.analyze

## Blip

Generate image captions

**Fields:**
task: Task
image: ImageRef
caption: str | None
question: str | None

## Blip2

Answers questions about images

**Fields:**
image: ImageRef
caption: bool
context: str | None
question: str
temperature: float
use_nucleus_sampling: bool

## ClipFeatures

Return CLIP features for the clip-vit-large-patch14 model

**Fields:**
inputs: str

## ClipInterrogator

The CLIP Interrogator is a prompt engineering tool that combines OpenAI's CLIP and Salesforce's BLIP to optimize text prompts to match a given image. Use the resulting prompts with text-to-image models like Stable Diffusion to create cool art!

**Fields:**
mode: Mode
image: ImageRef
clip_model_name: Clip_model_name

## GLM_4V_9B

GLM-4V is a multimodal model competitive with GPT-4o and other top models.

**Fields:**
image: ImageRef
prompt: str | None

## Img2Prompt

Get an approximate text prompt, with style, matching an image.  (Optimized for stable-diffusion (clip ViT-L/14))

**Fields:**
image: ImageRef

## Llava13b

Visual instruction tuning towards large language and vision models with GPT-4 level capabilities

**Fields:**
image: ImageRef
top_p: float
prompt: str | None
max_tokens: int
temperature: float

## Llava34B

LLaVA v1.6: Large Language and Vision Assistant (Nous-Hermes-2-34B)

**Fields:**
image: ImageRef
top_p: float
prompt: str | None
history: list | None
max_tokens: int
temperature: float

## MiniGPT4

A model which generates text in response to an input image and prompt.

**Fields:**
image: ImageRef
top_p: float
prompt: str | None
num_beams: int
max_length: int
temperature: float
max_new_tokens: int
repetition_penalty: float

## Moondream2

moondream2 is a small vision language model designed to run efficiently on edge devices

**Fields:**
image: ImageRef
prompt: str

## NSFWImageDetection

Falcons.ai Fine-Tuned Vision Transformer (ViT) for NSFW Image Classification

**Fields:**
image: str | None

## SDXLClipInterrogator

CLIP Interrogator for SDXL optimizes text prompts to match a given image

**Fields:**
mode: Mode
image: ImageRef

