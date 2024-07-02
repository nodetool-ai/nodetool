# nodetool.nodes.huggingface.image

## Classifier

Image classification is the task of assigning a label or class to an entire image.
take an image as input and return a prediction about which class the image belongs to.

**Tags:** Images are expected to have only one class for each image. Image classification models

**Inherits from:** HuggingfaceNode

- **model**: The model ID to use for the classification (`ModelId`)
- **image**: The input image to classify (`ImageRef`)

## Segformer

**Inherits from:** HuggingfaceNode

- **image**: The input image to segment (`ImageRef`)

## StableDiffusionXL

Generates images from input text. These models can be used to generate and
image, text, image generation, text-to-image, image-to-image, image generation, image synthesis

### Use Cases
* Businesses can generate data for their their use cases by inputting text and getting image outputs.
* Chatbots can be made more immersive if they provide contextual images based on the input provided by the user.
* Different patterns can be generated to obtain unique pieces of fashion. Text-to-image models make creations easier for designers to conceptualize their design before actually implementing it.
* Architects can utilise the models to construct an environment based out on the requirements of the floor plan. This can also include the furniture that has to be placed in that environment.

**Tags:** modify images based on text prompts.

**Inherits from:** HuggingfaceNode

- **model**: The model ID to use for the image generation (`ModelId`)
- **inputs**: The input text to the model (`str`)
- **negative_prompt**: The negative prompt to use. (`str`)
- **seed** (`int`)
- **guidance_scale** (`float`)
- **num_inference_steps** (`int`)
- **width** (`int`)
- **height** (`int`)
- **scheduler** (`Scheduler`)

